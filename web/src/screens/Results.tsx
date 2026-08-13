import { useSession } from "../lib/SessionContext";
import { useDimensions } from "../lib/useDimensions";
import { TraitMeter } from "../components/Meter";
import { overallConfidence, hasAnyEvidence } from "../lib/profileMath";
import { clarityLabel, clarityHint } from "../lib/constants";

export function Results() {
  const { profile, name, loading } = useSession();
  const dimensions = useDimensions();

  if (loading || !profile) {
    return (
      <section>
        <h1 className="screen-title">Profile</h1>
        <div className="card">Loading…</div>
      </section>
    );
  }

  if (!hasAnyEvidence(profile)) {
    return (
      <section>
        <h1 className="screen-title">Profile</h1>
        <div className="card empty-card">
          <div className="empty-icon">🧩</div>
          <div className="empty-title">No answers yet</div>
          <div className="empty-sub">Take the Quick Start quiz to start building a profile.</div>
        </div>
      </section>
    );
  }

  const clarity = clarityLabel(overallConfidence(profile));
  const hint = clarityHint(overallConfidence(profile));

  return (
    <section>
      <h1 className="screen-title">{name ? `${name}'s profile` : "Your profile"}</h1>
      <p className="screen-sub">
        <span className="chip">
          <span className="chip-dot" style={{ background: "var(--series-1)" }} />
          Clarity: {clarity}
        </span>{" "}
        {hint}
      </p>
      <div className="card">
        <div className="trait-grid">
          {dimensions.map((meta) => {
            const dim = profile[meta.id];
            if (!dim) return null;
            return <TraitMeter key={meta.id} label={meta.label} low={meta.low} high={meta.high} dim={dim} />;
          })}
        </div>
      </div>
      <p style={{ fontSize: 12, color: "var(--muted)" }}>
        Grayed-out traits below just need a few more answers before the twin will use them —
        answer more questions any time to fill them in.
      </p>
    </section>
  );
}
