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

export function leanDescription(value: number, low: string, high: string): string {
  const distance = Math.abs(value - 0.5);
  const toward = value >= 0.5 ? high : low;
  if (distance < 0.06) return "Right in the middle — a mix of both";
  if (distance < 0.18) return `Slightly leans toward ${toward}`;
  if (distance < 0.35) return `Leans toward ${toward}`;
  return `Strongly leans toward ${toward}`;
}

export function sureLabel(confidence: number): string {
  if (confidence < 0.55) return "Fairly sure";
  if (confidence < 0.75) return "Sure";
  return "Very sure";
}
