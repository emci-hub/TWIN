// The locked scoring math — see docs/CORE.md. Do not change these formulas
// without a written decision; everything downstream (profile, twin compiler,
// API) assumes this exact behavior.
//
//   value      = alpha / (alpha + beta)
//   confidence = E / (E + 8), where E = alpha + beta - 2
//   weights: weak .5 / moderate 1 / strong 1.5 / very strong 2
//
// Dimensions start at a uniform prior — Beta(1, 1) — so a fresh dimension
// has value 0.5 and confidence 0 (E = 0) before any evidence arrives.

export type Direction = "+" | "-";
export type Strength = "weak" | "moderate" | "strong" | "very strong";

/** Weakest to strongest — used to compare/cap strengths against a trust tier. */
export const STRENGTH_ORDER: Strength[] = [
  "weak",
  "moderate",
  "strong",
  "very strong",
];

export const STRENGTH_WEIGHTS: Record<Strength, number> = {
  weak: 0.5,
  moderate: 1,
  strong: 1.5,
  "very strong": 2,
};

export interface DimensionState {
  alpha: number;
  beta: number;
}

export interface DimensionScore extends DimensionState {
  value: number;
  confidence: number;
}

/** A fresh dimension: Beta(1, 1) uniform prior. */
export function createDimensionState(): DimensionState {
  return { alpha: 1, beta: 1 };
}

/** Pure — returns a new state, never mutates the one passed in. */
export function applyEvidence(
  state: DimensionState,
  direction: Direction,
  strength: Strength,
): DimensionState {
  const weight = STRENGTH_WEIGHTS[strength];
  if (direction === "+") {
    return { alpha: state.alpha + weight, beta: state.beta };
  }
  return { alpha: state.alpha, beta: state.beta + weight };
}

export function computeValue(state: DimensionState): number {
  return state.alpha / (state.alpha + state.beta);
}

export function computeConfidence(state: DimensionState): number {
  const E = state.alpha + state.beta - 2;
  return E / (E + 8);
}

export function scoreDimension(state: DimensionState): DimensionScore {
  return {
    ...state,
    value: computeValue(state),
    confidence: computeConfidence(state),
  };
}
