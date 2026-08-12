import { CONFIDENCE_THRESHOLD } from "../lib/constants";
import type { DimensionProfile } from "../lib/api";

/** Full trait-grid row — label, low↔high axis, fill bar, value% / confidence%. Grayed out below the twin compiler's own 0.35 confidence gate (docs/CORE.md), same threshold the twin prompt itself uses to decide whether to voice a trait at all. */
export function TraitMeter({
  label,
  low,
  high,
  dim,
}: {
  label: string;
  low: string;
  high: string;
  dim: DimensionProfile;
}) {
  const belowThreshold = dim.confidence < CONFIDENCE_THRESHOLD;
  return (
    <div className={`meter-row${belowThreshold ? " dim" : ""}`}>
      <div className="meter-labels">
        <span>{label}</span>
        <span>
          {low} ↔ {high}
        </span>
      </div>
      <div className="meter-track">
        <div className="meter-fill" style={{ width: `${dim.value * 100}%` }} />
      </div>
      <div className="meter-meta">
        <span className={belowThreshold ? "warn" : undefined}>
          {belowThreshold
            ? "Still forming — needs more answers"
            : `${Math.round(dim.value * 100)}% toward ${high}`}
        </span>
        <span>{Math.round(dim.confidence * 100)}% confidence</span>
      </div>
    </div>
  );
}

/** Compact version for Home's 4-trait preview row. */
export function MiniMeter({ label, dim }: { label: string; dim: DimensionProfile }) {
  return (
    <div className="mini-meter">
      <label>{label}</label>
      <div className="meter-track">
        <div className="meter-fill" style={{ width: `${dim.value * 100}%` }} />
      </div>
    </div>
  );
}
