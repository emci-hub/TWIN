import { describe, it, expect } from "vitest";
import {
  QuizSession,
  QUESTION_BANK,
  DEFAULT_QUIZ_CONFIG,
  selectQuickStart,
  computeEffectiveConfidence,
} from "./question-delivery.js";
import { DIMENSION_IDS } from "./profile.js";
import type { Question } from "./question-delivery.js";

// Small seeded PRNG so the "random answerer" simulation is reproducible —
// this is test-only, not something the app itself needs at runtime.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Always answers with whichever option pushes '+' for the question's dimension. */
function consistentPick(question: Question): string {
  const plusOption = question.options.find((o) =>
    o.targets.some((t) => t.direction === "+"),
  );
  return (plusOption ?? question.options[0]).id;
}

/** Picks uniformly at random among the question's options. */
function randomPick(question: Question, rand: () => number): string {
  const index = Math.floor(rand() * question.options.length);
  return question.options[index].id;
}

function runSession(
  pick: (q: Question, rand: () => number) => string,
  rand: () => number,
) {
  const session = new QuizSession();
  const seenQuestionIds: string[] = [];

  let guard = 0;
  while (!session.isDone) {
    guard += 1;
    if (guard > 500) throw new Error("simulation ran too long — infinite loop?");

    const batch = session.currentBatch();
    if (session.isDone) break;

    for (const question of batch) {
      seenQuestionIds.push(question.id);
      const optionId = pick(question, rand);
      session.answer(question.id, optionId);
    }
  }

  return { session, seenQuestionIds };
}

describe("selectQuickStart", () => {
  it("covers all 12 dimensions at least once", () => {
    const batch = selectQuickStart();
    const dimsCovered = new Set(
      batch.flatMap((q) => q.options.flatMap((o) => o.targets.map((t) => t.dim))),
    );
    for (const dim of DIMENSION_IDS) {
      expect(dimsCovered.has(dim)).toBe(true);
    }
  });

  it("never picks the same question twice", () => {
    const batch = selectQuickStart();
    const ids = batch.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("QuizSession — consistent answerer", () => {
  it("reaches target confidence in a sensible number of questions, with no contradictions", () => {
    const { session, seenQuestionIds } = runSession(consistentPick, Math.random);

    expect(session.stopReason).toBe("target_confidence");
    expect(session.answeredCount).toBeLessThan(QUESTION_BANK.length);
    expect(session.answeredCount).toBeLessThanOrEqual(DEFAULT_QUIZ_CONFIG.max_questions);

    const profile = session.profile;
    for (const dim of DIMENSION_IDS) {
      expect(profile[dim].contradiction_flag).toBe(false);
    }

    const effective = computeEffectiveConfidence(profile);
    expect(effective).toBeGreaterThanOrEqual(DEFAULT_QUIZ_CONFIG.target_confidence);

    // sanity: "sensible number" — didn't stop after just Quick Start, but
    // also didn't need to burn through the whole bank
    expect(seenQuestionIds.length).toBeGreaterThan(DEFAULT_QUIZ_CONFIG.quick_start_size);
  });

  it("never re-selects a question_id already answered this session", () => {
    const { seenQuestionIds } = runSession(consistentPick, Math.random);
    expect(new Set(seenQuestionIds).size).toBe(seenQuestionIds.length);
  });
});

describe("QuizSession — random answerer", () => {
  it("stays below target confidence and stops on the max-questions cap, not target_confidence", () => {
    const rand = mulberry32(12345);
    const { session } = runSession(randomPick, rand);

    expect(session.stopReason).not.toBe("target_confidence");
    expect(["max_questions", "bank_exhausted"]).toContain(session.stopReason);

    const effective = computeEffectiveConfidence(session.profile);
    expect(effective).toBeLessThan(DEFAULT_QUIZ_CONFIG.target_confidence);
  });

  it("never re-selects a question_id already answered this session", () => {
    const rand = mulberry32(999);
    const { seenQuestionIds } = runSession(randomPick, rand);
    expect(new Set(seenQuestionIds).size).toBe(seenQuestionIds.length);
  });

  it("racks up contradiction flags across multiple dimensions (inconsistent picks)", () => {
    const rand = mulberry32(42);
    const { session } = runSession(randomPick, rand);
    const profile = session.profile;
    const contradictedCount = DIMENSION_IDS.filter(
      (dim) => profile[dim].contradiction_flag,
    ).length;
    expect(contradictedCount).toBeGreaterThan(0);
  });
});

describe("QuizSession — answer() guards", () => {
  it("throws if a question_id is answered twice", () => {
    const session = new QuizSession();
    const batch = session.currentBatch();
    const q = batch[0];
    session.answer(q.id, q.options[0].id);
    expect(() => session.answer(q.id, q.options[0].id)).toThrow();
  });

  it("throws on an unknown question or option id", () => {
    const session = new QuizSession();
    expect(() => session.answer("not_a_real_id", "a")).toThrow();
    const batch = session.currentBatch();
    expect(() => session.answer(batch[0].id, "not_a_real_option")).toThrow();
  });
});

describe("QuizSession — roundSize", () => {
  // Phase 6 (/web) draws its quiz progress bar from this value instead of
  // the live queue length, specifically because the queue only ever shows
  // what's LEFT to answer — after a page refresh rebuilds the session from
  // stored answers, a mid-round queue length is not the round's true
  // starting size. roundSize is a structural constant from
  // quiz-config.json, so it stays correct no matter when it's read.
  it("reports quick_start_size during Quick Start, even mid-round", () => {
    const session = new QuizSession();
    expect(session.roundSize).toBe(DEFAULT_QUIZ_CONFIG.quick_start_size);

    const batch = session.currentBatch();
    session.answer(batch[0].id, batch[0].options[0].id);
    // still mid Quick Start — the queue has shrunk by one, but roundSize
    // must not move, since that's exactly what a post-refresh rebuild
    // needs to still be correct.
    expect(session.roundSize).toBe(DEFAULT_QUIZ_CONFIG.quick_start_size);
  });

  it("reports sharpen_batch_size once the session moves into sharpen", () => {
    const session = new QuizSession();
    let batch = session.currentBatch();
    while (session.phaseName === "quick_start") {
      const q = batch[0];
      session.answer(q.id, consistentPick(q));
      batch = session.currentBatch();
    }
    if (session.phaseName === "sharpen") {
      expect(session.roundSize).toBe(DEFAULT_QUIZ_CONFIG.sharpen_batch_size);
    }
  });
});
