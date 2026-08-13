import { useState } from "react";
import { useSession } from "../lib/SessionContext";
import { useDimensions } from "../lib/useDimensions";
import { MiniMeter } from "../components/Meter";
import { overallConfidence, hasAnyEvidence } from "../lib/profileMath";
import { clarityLabel } from "../lib/constants";
import type { ScreenId } from "../lib/useHashRoute";

const PREVIEW_DIM_IDS = ["extraversion", "openness", "directness", "humor_dryness"];

export function Home({ onNavigate }: { onNavigate: (id: ScreenId) => void }) {
  const { name, setName, profile, answers, loading } = useSession();
  const dimensions = useDimensions();
  const [draftName, setDraftName] = useState("");
  const [editingName, setEditingName] = useState(!name);

  const filled = hasAnyEvidence(profile);
  const clarity = profile ? clarityLabel(overallConfidence(profile)) : "Sketch";

  function saveName() {
    const trimmed = draftName.trim();
    if (!trimmed) return;
    setName(trimmed);
    setEditingName(false);
  }

  return (
    <section>
      <div className="home-greeting">
        <div>
          <h1 className="screen-title">{name ? `Hey, ${name} 👋` : "Hey there 👋"}</h1>
          <p className="screen-sub" style={{ margin: 0 }}>
            Everything lives here — your profile once it exists, and settings always.
          </p>
        </div>
        {editingName ? (
          <div className="name-row">
            <input
              type="text"
              placeholder="What should we call you?"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveName()}
            />
            <button className="btn btn-primary" onClick={saveName}>
              Save
            </button>
          </div>
        ) : (
          <button className="btn" onClick={() => setEditingName(true)}>
            Change name
          </button>
        )}
      </div>

      {loading && <div className="card">Loading your session…</div>}

      {!loading && !filled && (
        <div className="card empty-card">
          <div className="empty-icon">🧩</div>
          <div className="empty-title">Your profile hasn't been built yet</div>
          <div className="empty-sub">
            Answer a Quick Start quiz — about a dozen questions, a couple of minutes — to get a
            first twin going. You can always sharpen it more later.
          </div>
          <div className="btn-row" style={{ justifyContent: "center" }}>
            <button className="btn btn-primary" onClick={() => onNavigate("quiz")}>
              Answer questions
            </button>
          </div>
        </div>
      )}

      {!loading && filled && profile && (
        <div className="card">
          <div className="profile-summary-top">
            <span className="chip">
              <span className="chip-dot" style={{ background: "var(--series-1)" }} />
              Clarity: {clarity}
            </span>
            <div className="btn-row">
              <button className="btn" onClick={() => onNavigate("results")}>
                View full profile
              </button>
              <button className="btn btn-primary" onClick={() => onNavigate("chat")}>
                Chat with your twin
              </button>
            </div>
          </div>
          <div className="mini-meter-row">
            {PREVIEW_DIM_IDS.map((id) => {
              const dim = profile[id];
              const meta = dimensions.find((d) => d.id === id);
              if (!dim || !meta) return null;
              return <MiniMeter key={id} label={meta.label} dim={dim} />;
            })}
          </div>
          <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>
            {answers.length} answer{answers.length === 1 ? "" : "s"} so far.
          </p>
        </div>
      )}

      <div className="home-footer-links">
        <a onClick={() => onNavigate("settings")}>Settings</a>
      </div>
    </section>
  );
}
