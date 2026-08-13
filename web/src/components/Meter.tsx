import { CONFIDENCE_THRESHOLD } from "../lib/constants";
import { leanDescription, sureLabel } from "../lib/profileMath";
import type { DimensionProfile } from "../lib/api";

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
      <div className="meter-head">
        <div className="meter-name">{label}</div>
        <div className="meter-axis">
          {low} <span aria-hidden="true">↔</span> {high}
        </div>
      </div>
      <div className="meter-track">
        <div className="meter-fill" style={{ width: `${dim.value * 100}%` }} />
      </div>
      <div className="meter-meta">
        <span className={belowThreshold ? "warn" : undefined}>
          {belowThreshold ? "Still forming — needs more answers" : leanDescription(dim.value, low, high)}
        </span>
        {!belowThreshold && <span className="meter-sure">{sureLabel(dim.confidence)}</span>}
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
