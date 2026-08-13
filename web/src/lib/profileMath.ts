import type { Profile } from "./api";

export function overallConfidence(profile: Profile): number {
  const values = Object.values(profile).map((d) => d.confidence);
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function hasAnyEvidence(profile: Profile | null): boolean {
  if (!profile) return false;
  return Object.values(profile).some((d) => d.confidence > 0);
}

/**
 * Turns a raw 0..1 trait value into a plain sentence instead of a bare
 * percentage. "54% toward Elaborate, likes to explain fully" reads like a
 * stats readout to someone who's never used this app before. A qualifier
 * word (slightly leans / leans / strongly leans) plus the plain-English
 * endpoint text the API already provides (low/high) says the same thing in
 * a sentence a stranger can parse on first read — the underlying number is
 * still there in the meter bar for anyone who wants the precise value.
 */
export function leanDescription(value: number, low: string, high: string): string {
  const distance = Math.abs(value - 0.5);
  const toward = value >= 0.5 ? high : low;
  if (distance < 0.06) return "Right in the middle — a mix of both";
  if (distance < 0.18) return `Slightly leans toward ${toward}`;
  if (distance < 0.35) return `Leans toward ${toward}`;
  return `Strongly leans toward ${toward}`;
}

/**
 * The API calls this number "confidence" — statistically, how sure the
 * evidence-gate math is about this trait. Shown bare as "36% confidence"
 * next to a personality trait, a reader can easily misread that as *their*
 * confidence as a person, which is a completely different thing. Renamed
 * and rebanded into plain English here so it only ever reads as "how sure
 * we are about this read," never as a trait of the person being profiled.
 */
export function sureLabel(confidence: number): string {
  if (confidence < 0.55) return "Fairly sure";
  if (confidence < 0.75) return "Sure";
  return "Very sure";
}
