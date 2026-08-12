// Wires the Evidence Gate to the scoring engine to build a full 12-dimension
// profile. This is the module /api will actually call — it never touches
// scoring.ts or evidence-gate.ts directly, and no game/screen ever edits a
// dimension's alpha/beta by hand.

import dimensions from "./content/dimensions.json" with { type: "json" };
import {
  createDimensionState,
  applyEvidence,
  scoreDimension,
  type DimensionState,
  type DimensionScore,
  type Direction,
} from "./scoring.js";
import {
  gateAnswer,
  type RawEvidence,
  type GateResult,
  type EvidenceSourceRegistry,
} from "./evidence-gate.js";

export interface DimensionProfile extends DimensionScore {
  /** true once this dimension has received evidence pointing both ways */
  contradiction_flag: boolean;
}

/** dimension id -> its current score */
export type Profile = Record<string, DimensionProfile>;

interface InternalDimensionState {
  state: DimensionState;
  directionsSeen: Set<Direction>;
}

/** The 12 fixed dimension ids, in docs/CORE.md/dimensions.json order. */
export const DIMENSION_IDS = (dimensions as { id: string }[]).map((d) => d.id);

/**
 * Builds a profile from a stream of answers. Raw answers are still the
 * source of truth (see docs/CORE.md) — this class is the calculator that
 * turns them into the current profile, recomputable at any time from the
 * same evidence log.
 */
export class ProfileBuilder {
  private dims = new Map<string, InternalDimensionState>();
  private registry?: EvidenceSourceRegistry;
  private frozen = false;

  constructor(registry?: EvidenceSourceRegistry) {
    this.registry = registry;
    for (const id of DIMENSION_IDS) {
      this.dims.set(id, {
        state: createDimensionState(),
        directionsSeen: new Set(),
      });
    }
  }

  /** Freezes the profile — no further evidence, gate-approved or not, moves it. */
  freeze(): void {
    this.frozen = true;
  }

  get isFrozen(): boolean {
    return this.frozen;
  }

  /**
   * Applies one answer — all the evidence produced by a single chosen
   * option — through the gate, then into scoring. Returns what the gate
   * did (approved vs. dropped, and why) so callers/tests can inspect it.
   */
  applyAnswer(source: string, batch: RawEvidence[]): GateResult {
    if (this.frozen) {
      return {
        approved: [],
        dropped: batch.map((item) => ({
          ...item,
          source,
          reason: "profile_frozen" as const,
        })),
      };
    }

    const result = gateAnswer(batch, source, this.registry);

    for (const item of result.approved) {
      const dim = this.dims.get(item.dim);
      if (!dim) continue; // defensive: ignore evidence for an unknown dimension id
      dim.state = applyEvidence(dim.state, item.direction, item.strength);
      dim.directionsSeen.add(item.direction);
    }

    return result;
  }

  toProfile(): Profile {
    const out: Profile = {};
    for (const [dimId, entry] of this.dims) {
      out[dimId] = {
        ...scoreDimension(entry.state),
        contradiction_flag: entry.directionsSeen.size > 1,
      };
    }
    return out;
  }
}
