import type { Profile } from "./api";

/** Plain average of every dimension's confidence — a display aggregate only.
 * All the real math (alpha/beta, per-dimension confidence) already happened
 * server-side in /core; this just summarizes numbers the API already gave us. */
export function overallConfidence(profile: Profile): number {
  const values = Object.values(profile).map((d) => d.confidence);
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function hasAnyEvidence(profile: Profile | null): boolean {
  if (!profile) return false;
  return Object.values(profile).some((d) => d.confidence > 0);
}
