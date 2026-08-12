// Question delivery — Quick Start, then sharpen batches, until the stop
// rule says enough. Uses Phase 1's content (/core/content/questions.json)
// and Phase 2's Evidence Gate + scoring (via ProfileBuilder).
//
// Tuning knobs (batch sizes, target confidence, max questions, the
// contradiction penalty below) live in /core/content/quiz-config.json, not
// as literals in this file — see docs/CORE.md's "no hardcoded content" rule.
//
// One deliberate deviation from the original ~8-question Quick Start
// estimate: Phase 1's content ended up one-dimension-per-question (no
// question targets more than one dimension), so 8 questions can only ever
// cover 8 of the 12 dimensions. quick_start_size is set to 12 — one
// question per dimension — so "covers all 12 dimensions at least once"
// (the actual requirement) is still met exactly. Flagged, not silently
// changed.

import questionsData from "./content/questions.json" with { type: "json" };
import quizConfigData from "./content/quiz-config.json" with { type: "json" };
import { DIMENSION_IDS, ProfileBuilder, type Profile } from "./profile.js";
import type {
  RawEvidence,
  GateResult,
  EvidenceSourceRegistry,
} from "./evidence-gate.js";

export interface Option {
  id: string;
  text: string;
  targets: RawEvidence[];
}

export interface Question {
  id: string;
  type: "preference" | "situational";
  source: string;
  prompt: string;
  options: Option[];
}

export interface QuizConfig {
  quick_start_size: number;
  sharpen_batch_size: number;
  /** stop once the (contradiction-discounted) overall confidence reaches this */
  target_confidence: number;
  /** hard ceiling regardless of confidence — the delivery-side retry/loop cap */
  max_questions: number;
  /**
   * Dimensions flagged contradictory (evidence has pointed both ways) count
   * for less when deciding whether to stop or what to sharpen next — the
   * math in scoring.ts is untouched and locked; this only affects delivery
   * decisions, on top of it. A flip-flopping dimension isn't a reliable
   * read yet, even if it has technically accumulated a lot of evidence.
   */
  contradiction_penalty: number;
}

export const QUESTION_BANK = questionsData as Question[];
export const DEFAULT_QUIZ_CONFIG = quizConfigData as QuizConfig;

export type StopReason = "target_confidence" | "max_questions" | "bank_exhausted";

export interface StopCheck {
  stop: boolean;
  reason: StopReason | null;
  overall_confidence: number;
  effective_confidence: number;
}

/** Plain average of every dimension's confidence — no discounting. */
export function computeOverallConfidence(profile: Profile): number {
  const values = DIMENSION_IDS.map((id) => profile[id].confidence);
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Same average, but a dimension currently flagged contradictory contributes
 * at `contradiction_penalty` of its raw confidence. Used for the stop rule
 * and for picking what to sharpen next, so a dimension that keeps getting
 * inconsistent answers doesn't get treated as "done" just because it has
 * racked up a lot of evidence.
 */
export function computeEffectiveConfidence(
  profile: Profile,
  config: QuizConfig = DEFAULT_QUIZ_CONFIG,
): number {
  const values = DIMENSION_IDS.map((id) => {
    const dim = profile[id];
    return dim.contradiction_flag
      ? dim.confidence * config.contradiction_penalty
      : dim.confidence;
  });
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Finds the first question in the bank that targets `dim` and isn't in `excludeIds`. */
function findNextQuestionForDim(
  bank: Question[],
  dim: string,
  excludeIds: Set<string>,
  preferType?: Question["type"],
): Question | null {
  let fallback: Question | null = null;
  for (const q of bank) {
    if (excludeIds.has(q.id)) continue;
    const targetsThisDim = q.options.some((opt) =>
      opt.targets.some((t) => t.dim === dim),
    );
    if (!targetsThisDim) continue;
    if (!preferType || q.type === preferType) return q;
    if (!fallback) fallback = q;
  }
  return fallback;
}

/**
 * Quick Start: one question per dimension (see the deviation note at the
 * top of this file), preferring preference-style items over situational
 * ones so the first pass is quick and broad. Guarantees every dimension in
 * `dimensionIds` is covered at least once, as long as the bank has a
 * question for it.
 */
export function selectQuickStart(
  bank: Question[] = QUESTION_BANK,
  dimensionIds: string[] = DIMENSION_IDS,
  size: number = DEFAULT_QUIZ_CONFIG.quick_start_size,
): Question[] {
  const picked: Question[] = [];
  const usedIds = new Set<string>();

  for (const dim of dimensionIds) {
    if (picked.length >= size) break;
    const q = findNextQuestionForDim(bank, dim, usedIds, "preference");
    if (q) {
      picked.push(q);
      usedIds.add(q.id);
    }
  }

  return picked;
}

/**
 * Sharpen batch: round-robins through dimensions ordered by ascending
 * effective confidence (lowest/least-reliable first), picking one
 * unanswered question per pass, until the batch is full or the bank has
 * nothing left to offer.
 */
export function selectSharpenBatch(
  profile: Profile,
  answeredIds: Set<string>,
  bank: Question[] = QUESTION_BANK,
  batchSize: number = DEFAULT_QUIZ_CONFIG.sharpen_batch_size,
  config: QuizConfig = DEFAULT_QUIZ_CONFIG,
): Question[] {
  const dimsByNeed = DIMENSION_IDS.slice().sort((a, b) => {
    const confA = profile[a].contradiction_flag
      ? profile[a].confidence * config.contradiction_penalty
      : profile[a].confidence;
    const confB = profile[b].contradiction_flag
      ? profile[b].confidence * config.contradiction_penalty
      : profile[b].confidence;
    return confA - confB;
  });

  const batch: Question[] = [];
  const usedIds = new Set(answeredIds);

  let madeProgress = true;
  while (batch.length < batchSize && madeProgress) {
    madeProgress = false;
    for (const dim of dimsByNeed) {
      if (batch.length >= batchSize) break;
      const q = findNextQuestionForDim(bank, dim, usedIds);
      if (q) {
        batch.push(q);
        usedIds.add(q.id);
        madeProgress = true;
      }
    }
  }

  return batch;
}

/** Stop once effective confidence hits target, or the max-questions cap is reached. */
export function shouldStop(
  profile: Profile,
  answeredCount: number,
  config: QuizConfig = DEFAULT_QUIZ_CONFIG,
): StopCheck {
  const overall = computeOverallConfidence(profile);
  const effective = computeEffectiveConfidence(profile, config);

  if (effective >= config.target_confidence) {
    return {
      stop: true,
      reason: "target_confidence",
      overall_confidence: overall,
      effective_confidence: effective,
    };
  }
  if (answeredCount >= config.max_questions) {
    return {
      stop: true,
      reason: "max_questions",
      overall_confidence: overall,
      effective_confidence: effective,
    };
  }
  return {
    stop: false,
    reason: null,
    overall_confidence: overall,
    effective_confidence: effective,
  };
}

export type QuizPhase = "quick_start" | "sharpen" | "done";

/**
 * Runs one quiz from Quick Start through sharpen batches to the stop rule.
 * Owns the answered-question-id list (so a question_id can never be
 * re-selected this session) and the underlying ProfileBuilder (so answers
 * go through the Evidence Gate exactly like any other source).
 */
export class QuizSession {
  private readonly bank: Question[];
  private readonly config: QuizConfig;
  private readonly builder: ProfileBuilder;
  private readonly answeredIds = new Set<string>();
  private queue: Question[];
  private phase: QuizPhase = "quick_start";
  private finalStopReason: StopReason | null = null;

  constructor(options?: {
    bank?: Question[];
    config?: QuizConfig;
    registry?: EvidenceSourceRegistry;
  }) {
    this.bank = options?.bank ?? QUESTION_BANK;
    this.config = options?.config ?? DEFAULT_QUIZ_CONFIG;
    this.builder = new ProfileBuilder(options?.registry);
    this.queue = selectQuickStart(
      this.bank,
      DIMENSION_IDS,
      this.config.quick_start_size,
    );
  }

  get profile(): Profile {
    return this.builder.toProfile();
  }

  get phaseName(): QuizPhase {
    return this.phase;
  }

  get isDone(): boolean {
    return this.phase === "done";
  }

  get stopReason(): StopReason | null {
    return this.finalStopReason;
  }

  get answeredCount(): number {
    return this.answeredIds.size;
  }

  get answeredQuestionIds(): string[] {
    return [...this.answeredIds];
  }

  /**
   * How many questions the CURRENT round (Quick Start, or this sharpen
   * batch) started with — a structural constant from quiz-config.json, not
   * derived from the live queue. Callers (the API, then /web) use this to
   * draw an accurate "N of M" progress indicator that survives a page
   * refresh, since a freshly-rebuilt queue only ever reflects what's LEFT
   * to answer, not the round's original size.
   */
  get roundSize(): number {
    return this.phase === "sharpen"
      ? this.config.sharpen_batch_size
      : this.config.quick_start_size;
  }

  /** The batch currently being shown — Quick Start's set, or the current sharpen batch. */
  currentBatch(): Question[] {
    this.advanceIfQueueEmpty();
    return this.queue;
  }

  private advanceIfQueueEmpty(): void {
    if (this.phase === "done" || this.queue.length > 0) return;

    const check = shouldStop(this.builder.toProfile(), this.answeredIds.size, this.config);
    if (check.stop) {
      this.phase = "done";
      this.finalStopReason = check.reason;
      return;
    }

    this.phase = "sharpen";
    const batch = selectSharpenBatch(
      this.builder.toProfile(),
      this.answeredIds,
      this.bank,
      this.config.sharpen_batch_size,
      this.config,
    );
    if (batch.length === 0) {
      this.phase = "done";
      this.finalStopReason = "bank_exhausted";
      return;
    }
    this.queue = batch;
  }

  /**
   * Answers one question from the current batch. Throws if the question was
   * already answered this session or isn't a real question/option — the
   * no-repeat rule is enforced here, not just hoped for by callers.
   */
  answer(questionId: string, optionId: string): GateResult {
    if (this.answeredIds.has(questionId)) {
      throw new Error(
        `question ${questionId} was already answered this session — question_ids never get re-selected`,
      );
    }
    const question = this.bank.find((q) => q.id === questionId);
    if (!question) {
      throw new Error(`unknown question id: ${questionId}`);
    }
    const option = question.options.find((o) => o.id === optionId);
    if (!option) {
      throw new Error(`unknown option "${optionId}" for question ${questionId}`);
    }

    this.answeredIds.add(questionId);
    this.queue = this.queue.filter((q) => q.id !== questionId);

    return this.builder.applyAnswer("quiz", option.targets);
  }
}
