export const CONFIDENCE_THRESHOLD = 0.35;

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

export const TWIN_CHAT_MAX_MESSAGE_LENGTH = 500;
