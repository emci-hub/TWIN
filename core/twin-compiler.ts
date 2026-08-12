// Twin compiler — turns a computed Profile into the twin's persona prompt.
// See docs/CORE.md: "Twin output is always hedged, confidence-gated,
// disclaimed. Never 'this is exactly you,' never clinical language.
// Dimensions below confidence 0.35 are omitted from the twin prompt
// entirely." This file is the one place that rule is enforced.
//
// Wording (hedge phrases, disclaimer, intro/outro) lives in
// /core/content/twin-copy.json, not as literals here — see the
// no-hardcoded-content rule. The 0.35 confidence gate and the banned-word
// list are locked behavior from docs/CORE.md, so — like scoring.ts's
// weights and evidence-gate.ts's dimension cap — they're named constants in
// code, not editable content.

import dimensionsData from "./content/dimensions.json" with { type: "json" };
import twinCopyData from "./content/twin-copy.json" with { type: "json" };
import { DIMENSION_IDS, type Profile } from "./profile.js";

export interface DimensionCopy {
  id: string;
  label: string;
  low: string;
  high: string;
}

export interface HedgeBand {
  min_confidence: number;
  phrase: string;
}

export interface TwinCopy {
  intro: string;
  hedge_bands: HedgeBand[];
  disclaimer: string;
  outro: string;
}

const DIMENSIONS = dimensionsData as DimensionCopy[];
const TWIN_COPY = twinCopyData as TwinCopy;

/** The raw dimensions.json content (id/label/low/high) — read-only export for callers like /api that need to display dimension text without duplicating content/dimensions.json. */
export const DIMENSIONS_CONTENT: readonly DimensionCopy[] = DIMENSIONS;

/** Locked rule (docs/CORE.md): dimensions below this confidence never reach the twin prompt. */
export const CONFIDENCE_THRESHOLD = 0.35;

/** Locked rule: the compiled prompt may never contain any of these, in any casing. */
export const BANNED_WORDS = ["clone", "always", "exact"] as const;

export interface CompiledDimensionLine {
  id: string;
  label: string;
  direction: "low" | "high";
  hedge_phrase: string;
  description: string;
}

export interface CompiledTwin {
  prompt: string;
  included_dimensions: string[];
  omitted_dimensions: string[];
  lines: CompiledDimensionLine[];
}

/** Picks the strongest hedge phrase whose min_confidence the dimension still clears. */
export function getHedgePhrase(
  confidence: number,
  bands: HedgeBand[] = TWIN_COPY.hedge_bands,
): string {
  const sorted = [...bands].sort((a, b) => a.min_confidence - b.min_confidence);
  let chosen = sorted[0]?.phrase ?? "may lean toward";
  for (const band of sorted) {
    if (confidence >= band.min_confidence) {
      chosen = band.phrase;
    }
  }
  return chosen;
}

/** Case-insensitive whole-text scan — returns any banned words actually found. */
export function findBannedWords(
  text: string,
  bannedWords: readonly string[] = BANNED_WORDS,
): string[] {
  const lower = text.toLowerCase();
  return bannedWords.filter((word) => lower.includes(word.toLowerCase()));
}

function dimensionCopyFor(id: string): DimensionCopy {
  const found = DIMENSIONS.find((d) => d.id === id);
  if (!found) {
    throw new Error(`no content/dimensions.json entry for dimension "${id}"`);
  }
  return found;
}

/**
 * Compiles a profile into the twin's persona prompt. Confidence-gated
 * (docs/CORE.md's 0.35 threshold), hedged wording per dimension, disclaimer
 * always present, banned words never present — enforced with a runtime
 * check below, not just tested.
 */
export function compileTwinPrompt(
  profile: Profile,
  dimensionIds: string[] = DIMENSION_IDS,
  copy: TwinCopy = TWIN_COPY,
): CompiledTwin {
  const included: string[] = [];
  const omitted: string[] = [];
  const lines: CompiledDimensionLine[] = [];

  for (const id of dimensionIds) {
    const dim = profile[id];
    if (!dim || dim.confidence < CONFIDENCE_THRESHOLD) {
      omitted.push(id);
      continue;
    }
    included.push(id);

    const copyForDim = dimensionCopyFor(id);
    const direction: "low" | "high" = dim.value >= 0.5 ? "high" : "low";
    const description = direction === "high" ? copyForDim.high : copyForDim.low;
    const hedgePhrase = getHedgePhrase(dim.confidence, copy.hedge_bands);

    lines.push({
      id,
      label: copyForDim.label,
      direction,
      hedge_phrase: hedgePhrase,
      description,
    });
  }

  const traitLines =
    lines.length > 0
      ? lines.map((l) => `- ${l.label} (${l.hedge_phrase}): ${l.description}`).join("\n")
      : "- Not enough answers yet to describe any traits with confidence.";

  const prompt = [copy.intro, "", traitLines, "", copy.disclaimer, copy.outro].join("\n");

  const leaked = findBannedWords(prompt);
  if (leaked.length > 0) {
    // Should be unreachable given the content this ships with — a hard
    // guard, not just a test, per docs/CORE.md's hedged/disclaimed rule.
    throw new Error(
      `compileTwinPrompt produced banned word(s): ${leaked.join(", ")} — check content/twin-copy.json and content/dimensions.json`,
    );
  }

  return { prompt, included_dimensions: included, omitted_dimensions: omitted, lines };
}
