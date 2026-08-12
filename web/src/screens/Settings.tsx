import { useState } from "react";
import { useSession } from "../lib/SessionContext";
import { getStoredProvider, setStoredProvider } from "../lib/storage";
import type { LlmProvider } from "../lib/api";

const PROVIDER_OPTIONS: { id: LlmProvider; label: string }[] = [
  { id: "anthropic", label: "Claude (default while credit lasts)" },
  { id: "openrouter", label: "OpenRouter — free tier" },
];

export function Settings() {
  const { frozen, freeze, error } = useSession();
  const [provider, setProvider] = useState<LlmProvider>(() => getStoredProvider());
  const [freezing, setFreezing] = useState(false);

  function choose(id: LlmProvider) {
    setProvider(id);
    setStoredProvider(id);
  }

  async function handleFreeze() {
    if (frozen || freezing) return;
    setFreezing(true);
    try {
      await freeze();
    } finally {
      setFreezing(false);
    }
  }

  return (
    <section>
      <h1 className="screen-title">Settings</h1>

      {error && <div className="banner banner-error">{error}</div>}

      <div className="card">
        <div className="section-label" style={{ marginTop: 0 }}>
          Twin chat AI
        </div>
        {PROVIDER_OPTIONS.map((opt) => (
          <button key={opt.id} className="radio-row" onClick={() => choose(opt.id)}>
            <div className={`radio-dot${provider === opt.id ? " sel" : ""}`} />
            <span>{opt.label}</span>
          </button>
        ))}
      </div>

      <div className="card">
        <div className="switch-row">
          <div>
            <b>Freeze profile</b>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              Stop all sources — quiz, games, everything — from moving your traits.
            </div>
          </div>
          <button
            className={`switch${frozen ? " on" : ""}`}
            disabled={frozen || freezing}
            onClick={handleFreeze}
            aria-label="Freeze profile"
          >
            <div className="knob" />
          </button>
        </div>
        {frozen && (
          <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 10 }}>
            Your profile is frozen. This can't be undone from here yet.
          </p>
        )}
      </div>
    </section>
  );
}
