import { describe, it, expect } from "vitest";
import {
  createDimensionState,
  applyEvidence,
  computeValue,
  computeConfidence,
  scoreDimension,
  STRENGTH_WEIGHTS,
} from "./scoring.js";

describe("scoring — the locked alpha/beta math (docs/CORE.md)", () => {
  it("starts at a uniform prior: alpha=1, beta=1, value=0.5, confidence=0", () => {
    const state = createDimensionState();
    expect(state).toEqual({ alpha: 1, beta: 1 });
    expect(computeValue(state)).toBe(0.5);
    expect(computeConfidence(state)).toBe(0);
  });

  it("matches the documented weight map exactly", () => {
    expect(STRENGTH_WEIGHTS).toEqual({
      weak: 0.5,
      moderate: 1,
      strong: 1.5,
      "very strong": 2,
    });
  });

  it("'+' evidence adds its weight to alpha, '-' evidence to beta", () => {
    let state = createDimensionState();
    state = applyEvidence(state, "+", "very strong"); // weight 2
    expect(state).toEqual({ alpha: 3, beta: 1 });
    state = applyEvidence(state, "-", "weak"); // weight .5
    expect(state).toEqual({ alpha: 3, beta: 1.5 });
  });

  it("is pure — applyEvidence never mutates the state passed in", () => {
    const original = createDimensionState();
    const snapshot = { ...original };
    applyEvidence(original, "+", "strong");
    expect(original).toEqual(snapshot);
  });

  it("value = alpha / (alpha + beta)", () => {
    expect(computeValue({ alpha: 3, beta: 1 })).toBeCloseTo(0.75, 10);
    expect(computeValue({ alpha: 1, beta: 3 })).toBeCloseTo(0.25, 10);
  });

  it("confidence = E / (E + 8), E = alpha + beta - 2", () => {
    // alpha=3, beta=1 -> E = 2 -> confidence = 2 / 10
    expect(computeConfidence({ alpha: 3, beta: 1 })).toBeCloseTo(0.2, 10);
    // alpha=1, beta=1 -> E = 0 -> confidence = 0
    expect(computeConfidence({ alpha: 1, beta: 1 })).toBe(0);
  });

  it("scoreDimension bundles state + value + confidence", () => {
    const scored = scoreDimension({ alpha: 3, beta: 1 });
    expect(scored).toEqual({
      alpha: 3,
      beta: 1,
      value: 0.75,
      confidence: 0.2,
    });
  });
});
