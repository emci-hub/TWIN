import { describe, it, expect } from "vitest";
import { ProfileBuilder } from "./profile.js";
import type { EvidenceSourceRegistry } from "./evidence-gate.js";

const registry: EvidenceSourceRegistry = {
  quiz: { feeds_profile: true, trust_tier: "very strong" },
};

describe("ProfileBuilder — integration of the gate + scoring engine", () => {
  it("order doesn't matter — same answers in a different order produce the same profile", () => {
    const answers: Array<[string, { dim: string; direction: "+" | "-"; strength: "weak" | "moderate" | "strong" | "very strong" }[]]> = [
      ["quiz", [{ dim: "openness", direction: "+", strength: "strong" }]],
      ["quiz", [{ dim: "conscientiousness", direction: "-", strength: "moderate" }]],
      ["quiz", [{ dim: "openness", direction: "-", strength: "weak" }]],
      ["quiz", [{ dim: "risk_tolerance", direction: "+", strength: "very strong" }]],
    ];
    const shuffled = [answers[3], answers[1], answers[0], answers[2]];

    const p1 = new ProfileBuilder(registry);
    for (const [source, batch] of answers) p1.applyAnswer(source, batch);

    const p2 = new ProfileBuilder(registry);
    for (const [source, batch] of shuffled) p2.applyAnswer(source, batch);

    expect(p1.toProfile()).toEqual(p2.toProfile());
  });

  it("value and confidence stay within [0, 1] no matter how much evidence piles up", () => {
    const profile = new ProfileBuilder(registry);
    for (let i = 0; i < 250; i++) {
      profile.applyAnswer("quiz", [
        {
          dim: "openness",
          direction: i % 3 === 0 ? "-" : "+",
          strength: "very strong",
        },
      ]);
    }
    const scored = profile.toProfile().openness;
    expect(scored.value).toBeGreaterThanOrEqual(0);
    expect(scored.value).toBeLessThanOrEqual(1);
    expect(scored.confidence).toBeGreaterThanOrEqual(0);
    expect(scored.confidence).toBeLessThan(1);
  });

  it("a dimension is flagged contradictory once it has evidence in both directions", () => {
    const profile = new ProfileBuilder(registry);
    profile.applyAnswer("quiz", [
      { dim: "risk_tolerance", direction: "+", strength: "moderate" },
    ]);
    expect(profile.toProfile().risk_tolerance.contradiction_flag).toBe(false);

    profile.applyAnswer("quiz", [
      { dim: "risk_tolerance", direction: "-", strength: "moderate" },
    ]);
    expect(profile.toProfile().risk_tolerance.contradiction_flag).toBe(true);

    // a dimension that's only ever seen one direction stays unflagged
    expect(profile.toProfile().openness.contradiction_flag).toBe(false);
  });

  it("a single answer never moves more than 3 dimensions", () => {
    const profile = new ProfileBuilder(registry);
    const before = profile.toProfile();

    profile.applyAnswer("quiz", [
      { dim: "openness", direction: "+", strength: "moderate" },
      { dim: "conscientiousness", direction: "+", strength: "moderate" },
      { dim: "extraversion", direction: "+", strength: "moderate" },
      { dim: "agreeableness", direction: "+", strength: "moderate" },
    ]);

    const after = profile.toProfile();
    const moved = Object.keys(after).filter(
      (dim) =>
        after[dim].alpha !== before[dim].alpha ||
        after[dim].beta !== before[dim].beta,
    );
    expect(moved.length).toBeLessThanOrEqual(3);
    // and agreeableness (the 4th dimension) is specifically the one dropped,
    // since the cap keeps the first 3 distinct dimensions it sees
    expect(after.agreeableness).toEqual(before.agreeableness);
  });

  it("evidence from an unregistered source never reaches scoring", () => {
    const profile = new ProfileBuilder(registry);
    const before = profile.toProfile().openness;

    const result = profile.applyAnswer("mystery_party_game", [
      { dim: "openness", direction: "+", strength: "very strong" },
    ]);

    expect(result.approved.length).toBe(0);
    expect(result.dropped[0].reason).toBe("unregistered_source");
    expect(profile.toProfile().openness).toEqual(before);
  });

  it("a frozen profile accepts no further evidence, even from a trusted source", () => {
    const profile = new ProfileBuilder(registry);
    profile.applyAnswer("quiz", [
      { dim: "openness", direction: "+", strength: "moderate" },
    ]);
    const before = profile.toProfile().openness;

    profile.freeze();
    const result = profile.applyAnswer("quiz", [
      { dim: "openness", direction: "+", strength: "very strong" },
    ]);

    expect(result.approved.length).toBe(0);
    expect(result.dropped[0].reason).toBe("profile_frozen");
    expect(profile.toProfile().openness).toEqual(before);
  });
});
