import { CONFIDENCE_THRESHOLD } from "../lib/constants";
import { leanDescription, sureLabel } from "../lib/profileMath";
import type { DimensionProfile } from "../lib/api";

/**
 * Full trait-grid row. Grayed out below the twin compiler's own 0.35
 * confidence gate (docs/CORE.md) — same threshold the twin prompt itself
 * uses to decide whether to voice a trait at all.
 *
 * Two content choices worth explaining, both made after a real person
 * looked at this screen and couldn't parse it:
 * 1. The name and the low↔high axis text are on their own line each
 *    (.meter-name / .meter-axis, stacked, not two same-line spans) —
 *    previously two adjacent <span>s relying on flex space-between to
 *    separate them, which rendered as one run-on word ("OpennessPrefers
 *    the familiar...") when that flex rule didn't apply. Stacking removes
 *    the failure mode entirely instead of just patching the CSS.
 * 2. "54% toward X" / "36% confidence" is stats-readout language — see
 *    leanDescription()/sureLabel() in lib/profileMath.ts for why those
 *    were replaced with plain sentences.
 */
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
