// Mirrors /core/twin-compiler.ts's CONFIDENCE_THRESHOLD (docs/CORE.md: dimensions
// below 0.35 confidence are omitted from the twin prompt). Used here only to decide
// which Results rows render grayed-out — a display choice, not a reimplementation
// of any scoring/gating logic. The real gate still lives in /core.
export const CONFIDENCE_THRESHOLD = 0.35;

// Overall-confidence bands for Home's "clarity" chip — presentational only,
// loosely anchored to the same 0.35 mark where individual traits become
// voiceable at all.
export const CLARITY_BANDS: { max: number; label: string; hint: string }[] = [
  { max: 0.1, label: "Sketch", hint: "Just a first impression — a few answers so far." },
  { max: 0.2, label: "Draft", hint: "Starting to take shape. A few more answers will sharpen it." },
  { max: 0.35, label: "Detailed", hint: "A solid read on most traits — keep going to fill in the rest." },
  { max: Infinity, label: "Sharp", hint: "A clear, well-evidenced picture across most traits." },
];

export function clarityLabel(overallConfidence: number): string {
  return CLARITY_BANDS.find((band) => overallConfidence < band.max)?.label ?? "Sharp";
}

export function clarityHint(overallConfidence: number): string {
  return CLARITY_BANDS.find((band) => overallConfidence < band.max)?.hint ?? CLARITY_BANDS[CLARITY_BANDS.length - 1].hint;
}

// Soft client-side mirror of /api/config.ts's TWIN_CHAT_MAX_MESSAGE_LENGTH
// default (500) — a UX nicety (maxLength on the input), not the real
// enforcement. The server is the actual boundary; this just avoids letting
// someone type past the limit only to get a rejection.
export const TWIN_CHAT_MAX_MESSAGE_LENGTH = 500;
