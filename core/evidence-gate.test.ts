import { describe, it, expect } from "vitest";
import {
  evaluateEvidence,
  gateAnswer,
  MAX_DIMENSIONS_PER_ANSWER,
  type EvidenceSourceRegistry,
} from "./evidence-gate.js";

// A test-only registry so we can exercise capping/unregistered behavior
// without touching the real, deliberately minimal content/evidence-sources.json
// (which only has "quiz" registered per Phase 2 — new sources get added when
// their own phase actually builds them, per docs/CORE.md).
const testRegistry: EvidenceSourceRegistry = {
  quiz: { feeds_profile: true, trust_tier: "very strong" },
  writing_sample: { feeds_profile: true, trust_tier: "moderate" },
  guess_twin: { feeds_profile: false, trust_tier: "weak" },
};

describe("evidence gate — source registry checks", () => {
  it("approves evidence from a registered, feeds_profile source within its trust tier", () => {
    const result = evaluateEvidence(
      { dim: "openness", direction: "+", strength: "moderate" },
      "quiz",
      testRegistry,
    );
    expect("approved" in result).toBe(true);
    if ("approved" in result) {
      expect(result.approved.strength).toBe("moderate");
      expect(result.approved.capped).toBe(false);
    }
  });

  it("evidence from an unregistered source never reaches scoring", () => {
    const result = evaluateEvidence(
      { dim: "openness", direction: "+", strength: "weak" },
      "brand_new_party_game",
      testRegistry,
    );
    expect("dropped" in result).toBe(true);
    if ("dropped" in result) {
      expect(result.dropped.reason).toBe("unregistered_source");
    }
  });

  it("drops evidence from a registered source with feeds_profile: false", () => {
    const result = evaluateEvidence(
      { dim: "openness", direction: "+", strength: "weak" },
      "guess_twin",
      testRegistry,
    );
    expect("dropped" in result).toBe(true);
    if ("dropped" in result) {
      expect(result.dropped.reason).toBe("feeds_profile_false");
    }
  });

  it("caps evidence above its source's trust_tier instead of dropping it", () => {
    const result = evaluateEvidence(
      { dim: "openness", direction: "+", strength: "very strong" },
      "writing_sample", // trust_tier: moderate
      testRegistry,
    );
    expect("approved" in result).toBe(true);
    if ("approved" in result) {
      expect(result.approved.strength).toBe("moderate"); // capped down
      expect(result.approved.original_strength).toBe("very strong");
      expect(result.approved.capped).toBe(true);
    }
  });

  it("never caps a strength that's already within the trust tier", () => {
    const result = evaluateEvidence(
      { dim: "openness", direction: "+", strength: "weak" },
      "writing_sample", // trust_tier: moderate, weak <= moderate
      testRegistry,
    );
    expect("approved" in result).toBe(true);
    if ("approved" in result) {
      expect(result.approved.strength).toBe("weak");
      expect(result.approved.capped).toBe(false);
    }
  });

  it("the real seeded registry only trusts 'quiz' so far", () => {
    const result = evaluateEvidence(
      { dim: "openness", direction: "+", strength: "weak" },
      "quiz",
    );
    expect("approved" in result).toBe(true);

    const unregistered = evaluateEvidence(
      { dim: "openness", direction: "+", strength: "weak" },
      "writing_sample", // not yet registered in the real file — that's Phase 5b's job
    );
    expect("dropped" in unregistered).toBe(true);
  });
});

describe("evidence gate — per-answer dimension cap", () => {
  it(`caps a single answer to at most ${MAX_DIMENSIONS_PER_ANSWER} distinct dimensions`, () => {
    const batch = [
      { dim: "openness", direction: "+" as const, strength: "moderate" as const },
      { dim: "conscientiousness", direction: "+" as const, strength: "moderate" as const },
      { dim: "extraversion", direction: "+" as const, strength: "moderate" as const },
      { dim: "agreeableness", direction: "+" as const, strength: "moderate" as const },
    ];
    const result = gateAnswer(batch, "quiz", testRegistry);

    const approvedDims = new Set(result.approved.map((e) => e.dim));
    expect(approvedDims.size).toBeLessThanOrEqual(MAX_DIMENSIONS_PER_ANSWER);
    expect(
      result.dropped.some((d) => d.reason === "batch_dimension_cap"),
    ).toBe(true);
  });

  it("does not cap a batch that targets 3 or fewer distinct dimensions", () => {
    const batch = [
      { dim: "openness", direction: "+" as const, strength: "moderate" as const },
      { dim: "conscientiousness", direction: "+" as const, strength: "moderate" as const },
      { dim: "extraversion", direction: "+" as const, strength: "moderate" as const },
    ];
    const result = gateAnswer(batch, "quiz", testRegistry);
    expect(result.approved.length).toBe(3);
    expect(result.dropped.length).toBe(0);
  });

  it("multiple evidence items on the same dimension in one answer don't count as extra dimensions", () => {
    const batch = [
      { dim: "openness", direction: "+" as const, strength: "weak" as const },
      { dim: "openness", direction: "+" as const, strength: "weak" as const },
      { dim: "conscientiousness", direction: "+" as const, strength: "weak" as const },
    ];
    const result = gateAnswer(batch, "quiz", testRegistry);
    expect(result.approved.length).toBe(3);
    expect(result.dropped.length).toBe(0);
  });
});
