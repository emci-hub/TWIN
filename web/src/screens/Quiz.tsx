import { useState } from "react";
import { useSession } from "../lib/SessionContext";
import type { ScreenId } from "../lib/useHashRoute";

const PHASE_TITLE: Record<string, string> = {
  quick_start: "Quick Start",
  sharpen: "Sharpen batch",
  done: "Quiz complete",
};

const STOP_REASON_COPY: Record<string, string> = {
  target_confidence: "Your profile reached a solid confidence level.",
  max_questions: "You've answered enough questions for this round.",
  bank_exhausted: "You've answered every question available right now.",
};

export function Quiz({ onNavigate }: { onNavigate: (id: ScreenId) => void }) {
  const { profile, phase, batch, done, stopReason, frozen, roundSize, submitAnswer, loading, error } =
    useSession();
  const [submittingOptionId, setSubmittingOptionId] = useState<string | null>(null);

  if (loading || !profile) {
    return (
      <section>
        <h1 className="screen-title">Quiz</h1>
        <div className="card">Loading…</div>
      </section>
    );
  }

  if (frozen) {
    return (
      <section>
        <h1 className="screen-title">Quiz</h1>
        <div className="card">
          Your profile is frozen (see Settings) — no new answers can be submitted right now.
        </div>
      </section>
    );
  }

  if (done || batch.length === 0) {
    return (
      <section>
        <h1 className="screen-title">Quiz complete</h1>
        <p className="screen-sub">
          {stopReason ? STOP_REASON_COPY[stopReason] ?? "" : "Nothing left to answer right now."}
        </p>
        <div className="card">
          <div className="btn-row">
            <button className="btn btn-primary" onClick={() => onNavigate("results")}>
              View results
            </button>
            <button className="btn" onClick={() => onNavigate("chat")}>
              Chat with your twin
            </button>
          </div>
        </div>
      </section>
    );
  }

  const question = batch[0];
  // roundSize is the true, server-known size of the current round (Quick
  // Start's config.quick_start_size, or config.sharpen_batch_size) — never
  // derived from the live queue, so it stays correct across a page refresh
  // (a rebuilt queue only ever reflects what's LEFT to answer).
  const roundStartSize = roundSize || batch.length;
  const answeredInRound = Math.max(0, roundStartSize - batch.length);
  const progressPct = roundStartSize > 0 ? Math.round((answeredInRound / roundStartSize) * 100) : 0;

  async function pick(optionId: string) {
    setSubmittingOptionId(optionId);
    try {
      await submitAnswer(question.id, optionId);
    } finally {
      setSubmittingOptionId(null);
    }
  }

  return (
    <section>
      <h1 className="screen-title">{PHASE_TITLE[phase ?? "quick_start"]}</h1>
      <p className="screen-sub">Forced-choice — pick whichever feels closer, neither option is "right."</p>

      {error && <div className="banner banner-error">{error}</div>}

      <div className="card">
        <div className="quiz-progress">
          <span className="chip">{phase === "sharpen" ? "Sharpening" : "Quick Start"}</span>
          <div className="bar">
            <div style={{ width: `${progressPct}%` }} />
          </div>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>
            {answeredInRound + 1} of {roundStartSize}
          </span>
        </div>
        <div className="quiz-question">{question.prompt}</div>
        <div className="quiz-options">
          {question.options.map((option) => (
            <button
              key={option.id}
              className="quiz-option"
              disabled={submittingOptionId !== null}
              onClick={() => pick(option.id)}
            >
              {submittingOptionId === option.id ? "Saving…" : option.text}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
