// The Evidence Gate — see docs/CORE.md and docs/ARCHITECTURE.md.
//
// Every input (quiz, writing sample, mini-game, party game, anything added
// later) is normalized to {dim, direction, strength} before it gets here.
// Nothing reaches the scoring engine without passing through this file.
//
// Two independent protections live here:
//   1. Per-source trust: is this source even allowed to touch the profile
//      (`feeds_profile`), and if so, at what max strength (`trust_tier`)?
//      An unregistered source is treated the same as `feeds_profile: false`
//      — dropped entirely. A registered source's evidence is capped to its
//      trust_tier, never dropped just for being "too strong."
//   2. Per-answer dimension cap: a single answer (one chosen option, which
//      may target more than one dimension) can move at most a handful of
//      dimensions. Anything beyond that cap is dropped so one answer can
//      never quietly swing an unbounded number of traits at once.

import defaultRegistry from "./content/evidence-sources.json" with { type: "json" };
import { STRENGTH_ORDER, type Direction, type Strength } from "./scoring.js";

/** A single normalized evidence item, before we know if it's approved. */
export interface RawEvidence {
  dim: string;
  direction: Direction;
  strength: Strength;
}

/** Evidence that passed the gate and is safe to apply to scoring. */
export interface GatedEvidence extends RawEvidence {
  source: string;
  original_strength: Strength;
  /** true if the strength was reduced to fit the source's trust_tier */
  capped: boolean;
}

export type DropReason =
  | "unregistered_source"
  | "feeds_profile_false"
  | "batch_dimension_cap"
  | "profile_frozen";

export interface DroppedEvidence extends RawEvidence {
  source: string;
  reason: DropReason;
}

export interface EvidenceSourceEntry {
  feeds_profile: boolean;
  trust_tier: Strength;
}

export type EvidenceSourceRegistry = Record<string, EvidenceSourceEntry>;

/** A single answer may move at most this many distinct dimensions. */
export const MAX_DIMENSIONS_PER_ANSWER = 3;

const DEFAULT_REGISTRY = defaultRegistry as EvidenceSourceRegistry;

export function getSourceEntry(
  source: string,
  registry: EvidenceSourceRegistry = DEFAULT_REGISTRY,
): EvidenceSourceEntry | undefined {
  return registry[source];
}

function capStrength(strength: Strength, trustTier: Strength): Strength {
  const requested = STRENGTH_ORDER.indexOf(strength);
  const max = STRENGTH_ORDER.indexOf(trustTier);
  return requested > max ? trustTier : strength;
}

/**
 * Checks a single evidence item against the source registry. Does NOT apply
 * the per-answer dimension cap — use gateAnswer() for a full batch.
 */
export function evaluateEvidence(
  item: RawEvidence,
  source: string,
  registry: EvidenceSourceRegistry = DEFAULT_REGISTRY,
): { approved: GatedEvidence } | { dropped: DroppedEvidence } {
  const entry = registry[source];

  if (!entry) {
    return { dropped: { ...item, source, reason: "unregistered_source" } };
  }
  if (!entry.feeds_profile) {
    return { dropped: { ...item, source, reason: "feeds_profile_false" } };
  }

  const cappedStrength = capStrength(item.strength, entry.trust_tier);
  return {
    approved: {
      ...item,
      strength: cappedStrength,
      source,
      original_strength: item.strength,
      capped: cappedStrength !== item.strength,
    },
  };
}

export interface GateResult {
  approved: GatedEvidence[];
  dropped: DroppedEvidence[];
}

/**
 * Gates a full answer — the batch of evidence produced by a single chosen
 * option. First enforces the per-answer dimension cap (structural, applies
 * regardless of source), then runs each remaining item through
 * evaluateEvidence().
 */
export function gateAnswer(
  batch: RawEvidence[],
  source: string,
  registry: EvidenceSourceRegistry = DEFAULT_REGISTRY,
): GateResult {
  const approved: GatedEvidence[] = [];
  const dropped: DroppedEvidence[] = [];
  const seenDims = new Set<string>();

  for (const item of batch) {
    const isNewDimension = !seenDims.has(item.dim);
    if (isNewDimension && seenDims.size >= MAX_DIMENSIONS_PER_ANSWER) {
      dropped.push({ ...item, source, reason: "batch_dimension_cap" });
      continue;
    }
    seenDims.add(item.dim);

    const result = evaluateEvidence(item, source, registry);
    if ("approved" in result) {
      approved.push(result.approved);
    } else {
      dropped.push(result.dropped);
    }
  }

  return { approved, dropped };
}
