// Coverage check for /core/content — run with: npm run coverage (from /core)
//
// Reads dimensions.json + questions.json and prints, per dimension:
//   - how many distinct questions reference it (via any option's targets)
//   - which sources those questions come from
//   - how many situational-judgment items target it
//
// Then checks the Phase 1 test criteria from docs/BUILD.md:
//   1. All 12 dimensions are covered.
//   2. Each dimension has >= 4 referencing questions.
//   3. At least 8 of the 12 dimensions are backed by a real published-scale
//      source (IPIP / DOSPERT / MSTAT-II / Need for Cognition) — not just
//      "custom" or "situational".
//   4. The 4 situational-judgment target dimensions (risk_tolerance,
//      analytical_detail, ambiguity_tolerance, directness) each have >= 2
//      situational items.

import dimensions from "./dimensions.json" with { type: "json" };
import questions from "./questions.json" with { type: "json" };

type Direction = "+" | "-";
type Strength = "weak" | "moderate" | "strong" | "very strong";

interface Target {
  dim: string;
  direction: Direction;
  strength: Strength;
}

interface Option {
  id: string;
  text: string;
  targets: Target[];
}

interface Question {
  id: string;
  type: "preference" | "situational";
  source: string;
  prompt: string;
  options: Option[];
}

const PUBLISHED_SCALES = new Set([
  "IPIP",
  "DOSPERT",
  "MSTAT-II",
  "Need for Cognition",
]);

const SITUATIONAL_TARGET_DIMS = [
  "risk_tolerance",
  "analytical_detail",
  "ambiguity_tolerance",
  "directness",
];

const qs = questions as Question[];
const dims = dimensions as { id: string; label: string }[];

interface DimCoverage {
  id: string;
  label: string;
  questionCount: number;
  sources: Set<string>;
  situationalCount: number;
}

const coverage = new Map<string, DimCoverage>();
for (const d of dims) {
  coverage.set(d.id, {
    id: d.id,
    label: d.label,
    questionCount: 0,
    sources: new Set(),
    situationalCount: 0,
  });
}

for (const q of qs) {
  const dimsHitByThisQuestion = new Set<string>();
  for (const opt of q.options) {
    for (const t of opt.targets) {
      dimsHitByThisQuestion.add(t.dim);
    }
  }
  for (const dimId of dimsHitByThisQuestion) {
    const entry = coverage.get(dimId);
    if (!entry) {
      console.warn(
        `WARNING: question ${q.id} targets unknown dimension "${dimId}" (not in dimensions.json)`,
      );
      continue;
    }
    entry.questionCount += 1;
    entry.sources.add(q.source);
    if (q.type === "situational") {
      entry.situationalCount += 1;
    }
  }
}

console.log("Dimension coverage");
console.log("===================\n");

let allDimsPresent = true;
let allDimsHaveFour = true;
let realSourceCount = 0;
const failingDims: string[] = [];

for (const d of dims) {
  const entry = coverage.get(d.id)!;
  const sourceList = [...entry.sources].sort().join(", ") || "(none)";
  const hasRealSource = [...entry.sources].some((s) => PUBLISHED_SCALES.has(s));
  if (hasRealSource) realSourceCount += 1;

  console.log(`${d.label} (${d.id})`);
  console.log(`  questions: ${entry.questionCount}`);
  console.log(`  sources:   ${sourceList}`);
  console.log(`  situational items: ${entry.situationalCount}`);
  console.log("");

  if (entry.questionCount === 0) allDimsPresent = false;
  if (entry.questionCount < 4) {
    allDimsHaveFour = false;
    failingDims.push(d.id);
  }
}

console.log("Situational-judgment target dimensions");
console.log("=======================================\n");
let allSituationalOk = true;
for (const dimId of SITUATIONAL_TARGET_DIMS) {
  const entry = coverage.get(dimId)!;
  const ok = entry.situationalCount >= 2;
  if (!ok) allSituationalOk = false;
  console.log(
    `  ${dimId}: ${entry.situationalCount} situational item(s) ${ok ? "OK" : "FAIL (need >= 2)"}`,
  );
}

console.log("\nSummary");
console.log("=======\n");
console.log(`  Total questions:            ${qs.length}`);
console.log(`  Dimensions defined:         ${dims.length}`);
console.log(
  `  All 12 dimensions covered:  ${allDimsPresent ? "PASS" : "FAIL"}`,
);
console.log(
  `  Every dimension has >= 4 questions: ${
    allDimsHaveFour ? "PASS" : `FAIL (${failingDims.join(", ")})`
  }`,
);
console.log(
  `  Dimensions with a real published-scale source: ${realSourceCount}/12 ${
    realSourceCount >= 8 ? "PASS" : "FAIL (need >= 8)"
  }`,
);
console.log(
  `  Situational coverage for targeted dims: ${allSituationalOk ? "PASS" : "FAIL"}`,
);

const overallPass =
  allDimsPresent && allDimsHaveFour && realSourceCount >= 8 && allSituationalOk;

console.log(`\nOverall: ${overallPass ? "PASS" : "FAIL"}`);

if (!overallPass) {
  process.exitCode = 1;
}
