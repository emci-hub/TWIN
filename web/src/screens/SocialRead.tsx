import { useState } from "react";
import { useDimensions } from "../lib/useDimensions";
import { api, ApiError, type SocialRead as SocialReadData } from "../lib/api";
import { getStoredProvider } from "../lib/storage";
import { leanDescription } from "../lib/profileMath";
import { SOCIAL_READ_MAX_LENGTH } from "../lib/constants";

/**
 * Deliberately its own screen, not folded into Results/Quiz — this is an
 * AI's guess at a piece of text, never additional evidence for the twin's
 * real quiz-based profile (the two answers this feature was scoped to:
 * "own content only" and "separate, clearly-labeled AI read"). Nothing
 * typed here is persisted anywhere — no session_id is involved, and the
 * server never writes it to the store (see /api/server.ts's
 * /twin/social-read route).
 */
export function SocialRead() {
  const dimensions = useDimensions();
  const [text, setText] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ read: SocialReadData; provider: string; model: string } | null>(null);

  const canSubmit = consent && text.trim().length > 0 && !loading;

  async function run() {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      const provider = getStoredProvider();
      const res = await api.socialRead(text.trim(), consent, provider);
      setResult(res);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't reach the AI read's provider — try again shortly.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <h1 className="screen-title">AI read</h1>
      <p className="screen-sub">
        Paste something you wrote yourself — a bio, a few messages, a short post — and an AI will
        take a casual guess at where it lands on the same traits the quiz measures.
      </p>

      <div className="card">
        <label className="checkbox-row">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            This is text I wrote myself, about myself — not someone else's words, and not someone
            else's profile.
          </span>
        </label>

        <textarea
          className="ai-read-textarea"
          placeholder="Paste your bio, a few messages, or a short post…"
          value={text}
          maxLength={SOCIAL_READ_MAX_LENGTH}
          disabled={loading}
          rows={8}
          onChange={(e) => setText(e.target.value)}
        />

        <div className="btn-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>
            {text.length}/{SOCIAL_READ_MAX_LENGTH}
          </span>
          <button className="btn btn-primary" disabled={!canSubmit} onClick={run}>
            {loading ? "Reading…" : "Get AI read"}
          </button>
        </div>

        {error && <div className="banner banner-error">{error}</div>}

        <p className="ai-read-privacy-note">
          Nothing you paste here is saved — it's sent to the AI provider for this one read and is
          never stored on our servers or added to your quiz profile.
        </p>
      </div>

      {result && (
        <div className="card">
          <div className="ai-read-label">
            <span className="chip">
              <span className="chip-dot" style={{ background: "var(--series-1)" }} />
              AI read — separate from your quiz profile
            </span>
          </div>

          {result.provider === "mock" && (
            <div className="banner banner-warning">
              Demo mode: the server is running the mock provider right now, so this is placeholder
              data, not a real analysis.
            </div>
          )}

          <div className="trait-grid">
            {dimensions.map((meta) => {
              const entry = result.read[meta.id];
              if (!entry) return null;
              return (
                <div className="meter-row" key={meta.id}>
                  <div className="meter-head">
                    <div className="meter-name">{meta.label}</div>
                    <div className="meter-axis">
                      {meta.low} <span aria-hidden="true">↔</span> {meta.high}
                    </div>
                  </div>
                  <div className="meter-track">
                    <div className="meter-fill" style={{ width: `${entry.value * 100}%` }} />
                  </div>
                  <div className="meter-meta">
                    <span>{leanDescription(entry.value, meta.low, meta.high)}</span>
                  </div>
                  <div className="ai-read-note">{entry.note}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
