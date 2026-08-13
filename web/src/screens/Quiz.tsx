import { useEffect, useRef, useState } from "react";
import { useSession } from "../lib/SessionContext";
import type { ScreenId } from "../lib/useHashRoute";
import type { Question } from "../lib/api";

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

const TRANSITION_MS = 180;

type View = { kind: "loading" } | { kind: "complete" } | { kind: "question"; question: Question };

export function Quiz({ onNavigate }: { onNavigate: (id: ScreenId) => void }) {
  const { profile, phase, batch, done, stopReason, frozen, roundSize, submitAnswer, loading, error } =
    useSession();

  const [view, setView] = useState<View>({ kind: "loading" });
  const [progress, setProgress] = useState({ answeredInRound: 0, roundStartSize: 0 });
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [cardPhase, setCardPhase] = useState<"visible" | "exiting" | "entering">("visible");
  const [hasSynced, setHasSynced] = useState(false);

  const batchRef = useRef(batch);
  const doneRef = useRef(done);
  const roundSizeRef = useRef(roundSize);
  useEffect(() => {
    batchRef.current = batch;
    doneRef.current = done;
    roundSizeRef.current = roundSize;
  }, [batch, done, roundSize]);

  useEffect(() => {
    if (!hasSynced && !loading && profile) {
      const roundStartSize = roundSize || batch.length;
      setProgress({ answeredInRound: Math.max(0, roundStartSize - batch.length), roundStartSize });
      setView(batch.length > 0 ? { kind: "question", question: batch[0] } : { kind: "complete" });
      setHasSynced(true);
    }
  }, [hasSynced, loading, profile, batch, roundSize]);

  if (loading || !profile || view.kind === "loading") {
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

  async function pick(optionId: string) {
    if (view.kind !== "question" || selectedOptionId) return;
    const question = view.question;

    setSelectedOptionId(optionId);
    setCardPhase("exiting");

    try {
      await Promise.all([submitAnswer(question.id, optionId), new Promise((r) => setTimeout(r, TRANSITION_MS))]);
    } catch {
      setSelectedOptionId(null);
      setCardPhase("visible");
      return;
    }

    const nextBatch = batchRef.current;
    const nextRoundStartSize = roundSizeRef.current || nextBatch.length;
    setProgress({
      answeredInRound: Math.max(0, nextRoundStartSize - nextBatch.length),
      roundStartSize: nextRoundStartSize,
    });
    setView(nextBatch.length > 0 ? { kind: "question", question: nextBatch[0] } : { kind: "complete" });
    setSelectedOptionId(null);

    setCardPhase("entering");
    requestAnimationFrame(() => requestAnimationFrame(() => setCardPhase("visible")));
  }

  if (view.kind === "complete") {
    return (
      <section>
        <h1 className="screen-title">Quiz complete</h1>
        <p className="screen-sub">
          {stopReason ? STOP_REASON_COPY[stopReason] ?? "" : "Nothing left to answer right now."}
        </p>
        <div className={`card quiz-card quiz-card-${cardPhase}`}>
          <div className="quiz-complete-badge" aria-hidden="true">
            ✓
          </div>
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

  const question = view.question;
  const progressPct =
    progress.roundStartSize > 0 ? Math.round((progress.answeredInRound / progress.roundStartSize) * 100) : 0;

  return (
    <section>
      <h1 className="screen-title">{PHASE_TITLE[phase ?? "quick_start"]}</h1>
      <p className="screen-sub">Forced-choice — pick whichever feels closer, neither option is "right."</p>

      {error && <div className="banner banner-error">{error}</div>}

      <div className={`card quiz-card quiz-card-${cardPhase}`}>
        <div className="quiz-progress">
          <span className="chip">{phase === "sharpen" ? "Sharpening" : "Quick Start"}</span>
          <div className="bar">
            <div style={{ width: `${progressPct}%` }} />
          </div>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>
            {progress.answeredInRound + 1} of {progress.roundStartSize}
          </span>
        </div>
        <div className="quiz-question">{question.prompt}</div>
        <div className="quiz-options">
          {question.options.map((option) => {
            const isSelected = selectedOptionId === option.id;
            const isOther = selectedOptionId !== null && !isSelected;
            return (
              <button
                key={option.id}
                className={`quiz-option${isSelected ? " selected" : ""}${isOther ? " not-selected" : ""}`}
                disabled={selectedOptionId !== null}
                onClick={() => pick(option.id)}
              >
                {option.text}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
