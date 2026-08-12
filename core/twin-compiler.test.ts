import { describe, it, expect } from "vitest";
import {
  compileTwinPrompt,
  getHedgePhrase,
  findBannedWords,
  CONFIDENCE_THRESHOLD,
  BANNED_WORDS,
} from "./twin-compiler.js";
import { DIMENSION_IDS, type Profile, type DimensionProfile } from "./profile.js";

/** A dimension with no evidence at all — the ProfileBuilder default. */
function emptyDim(): DimensionProfile {
  return { alpha: 1, beta: 1, value: 0.5, confidence: 0, contradiction_flag: false };
}

function scoredDim(value: number, confidence: number, contradiction_flag = false): DimensionProfile {
  return { alpha: 1, beta: 1, value, confidence, contradiction_flag };
}

/** Builds a full 12-dimension profile, defaulting every dim to "no evidence", with overrides applied. */
function buildProfile(overrides: Partial<Record<string, DimensionProfile>>): Profile {
  const profile: Profile = {};
  for (const id of DIMENSION_IDS) {
    profile[id] = overrides[id] ?? emptyDim();
  }
  return profile;
}

describe("twin compiler — confidence gate", () => {
  it("omits any dimension with confidence below 0.35", () => {
    const profile = buildProfile({
      openness: scoredDim(0.8, 0.34), // just under the threshold
      conscientiousness: scoredDim(0.8, 0.35), // exactly at the threshold — included
    });

    const result = compileTwinPrompt(profile);

    expect(result.omitted_dimensions).toContain("openness");
    expect(result.included_dimensions).not.toContain("openness");
    expect(result.included_dimensions).toContain("conscientiousness");
    expect(result.prompt).not.toContain("Openness");
  });

  it("omits every dimension untouched by evidence (confidence 0)", () => {
    const profile = buildProfile({});
    const result = compileTwinPrompt(profile);
    expect(result.included_dimensions).toEqual([]);
    expect(result.omitted_dimensions).toEqual(DIMENSION_IDS);
  });

  it("still produces a valid prompt (with disclaimer) when nothing meets the threshold", () => {
    const profile = buildProfile({});
    const result = compileTwinPrompt(profile);
    expect(result.prompt.length).toBeGreaterThan(0);
    expect(result.prompt.toLowerCase()).toContain("not enough answers");
  });

  it("includes a dimension once its confidence reaches the threshold", () => {
    const profile = buildProfile({
      humor_dryness: scoredDim(0.9, 0.6),
    });
    const result = compileTwinPrompt(profile);
    expect(result.included_dimensions).toContain("humor_dryness");
    expect(result.prompt).toContain("Humor dryness");
  });
});

describe("twin compiler — disclaimer", () => {
  it("always includes the non-clinical disclaimer, confident profile or not", () => {
    const confident = buildProfile({ openness: scoredDim(0.8, 0.9) });
    const empty = buildProfile({});

    for (const profile of [confident, empty]) {
      const result = compileTwinPrompt(profile);
      expect(result.prompt).toContain(
        "probabilistic sketch built from quiz answers, not a clinical profile",
      );
    }
  });
});

describe("twin compiler — banned words", () => {
  it("never outputs 'clone', 'always', or 'exact' in any casing", () => {
    // sweep a range of values/confidences across every dimension so every
    // hedge band and both directions (low/high) get exercised at least once
    const overrides: Partial<Record<string, DimensionProfile>> = {};
    DIMENSION_IDS.forEach((id, i) => {
      const value = i % 2 === 0 ? 0.85 : 0.15;
      const confidence = [0.4, 0.6, 0.8][i % 3];
      overrides[id] = scoredDim(value, confidence);
    });
    const profile = buildProfile(overrides);
    const result = compileTwinPrompt(profile);

    expect(findBannedWords(result.prompt)).toEqual([]);
    for (const word of BANNED_WORDS) {
      expect(result.prompt.toLowerCase()).not.toContain(word);
    }
  });

  it("findBannedWords is case-insensitive", () => {
    expect(findBannedWords("This is an EXACT clone, ALWAYS.")).toEqual(
      expect.arrayContaining(["clone", "always", "exact"]),
    );
    expect(findBannedWords("Nothing questionable here.")).toEqual([]);
  });

  it("the shipped content/twin-copy.json and content/dimensions.json are themselves clean", () => {
    // this is really a content-authoring guard: if someone edits the JSON
    // and accidentally introduces a banned word, this test catches it
    // without needing to hand-craft a profile that exercises every line.
    const everyDimConfident = buildProfile(
      Object.fromEntries(DIMENSION_IDS.map((id) => [id, scoredDim(0.9, 0.9)])),
    );
    const everyDimConfidentLow = buildProfile(
      Object.fromEntries(DIMENSION_IDS.map((id) => [id, scoredDim(0.1, 0.9)])),
    );
    expect(findBannedWords(compileTwinPrompt(everyDimConfident).prompt)).toEqual([]);
    expect(findBannedWords(compileTwinPrompt(everyDimConfidentLow).prompt)).toEqual([]);
  });
});

describe("getHedgePhrase", () => {
  const bands = [
    { min_confidence: 0.35, phrase: "may lean toward" },
    { min_confidence: 0.55, phrase: "tends to" },
    { min_confidence: 0.75, phrase: "generally" },
  ];

  it("picks the highest band the confidence still clears", () => {
    expect(getHedgePhrase(0.35, bands)).toBe("may lean toward");
    expect(getHedgePhrase(0.5, bands)).toBe("may lean toward");
    expect(getHedgePhrase(0.55, bands)).toBe("tends to");
    expect(getHedgePhrase(0.74, bands)).toBe("tends to");
    expect(getHedgePhrase(0.75, bands)).toBe("generally");
    expect(getHedgePhrase(0.99, bands)).toBe("generally");
  });
});

describe("twin compiler — dimension line content", () => {
  it("uses the high description when value >= 0.5, low description otherwise", () => {
    const profile = buildProfile({
      openness: scoredDim(0.9, 0.5), // high
      neuroticism: scoredDim(0.1, 0.5), // low
    });
    const result = compileTwinPrompt(profile);

    const openness = result.lines.find((l) => l.id === "openness")!;
    expect(openness.direction).toBe("high");
    expect(openness.description).toContain("new ideas");

    const neuroticism = result.lines.find((l) => l.id === "neuroticism")!;
    expect(neuroticism.direction).toBe("low");
    expect(neuroticism.description).toContain("Steady");
  });

  it(`only ever includes dimensions at or above the locked ${CONFIDENCE_THRESHOLD} threshold`, () => {
    const profile = buildProfile(
      Object.fromEntries(
        DIMENSION_IDS.map((id, i) => [id, scoredDim(0.6, i / DIMENSION_IDS.length)]),
      ),
    );
    const result = compileTwinPrompt(profile);
    for (const id of result.included_dimensions) {
      expect(profile[id].confidence).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD);
    }
    for (const id of result.omitted_dimensions) {
      expect(profile[id].confidence).toBeLessThan(CONFIDENCE_THRESHOLD);
    }
  });
});
