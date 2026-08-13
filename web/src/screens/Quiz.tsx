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

// Matches the CSS transition-duration on .quiz-card's states in theme.css
// — one constant so the JS hold time and the CSS animation can't drift
// apart. Kept short and identical no matter which option was tapped or how
// fast the network responds (see pick() below) — the point is a snappier
// feel, never a signal about the answer itself.
const TRANSITION_MS = 180;

type View = { kind: "loading" } | { kind: "complete" } | { kind: "question"; question: Question };

export function Quiz({ onNavigate }: { onNavigate: (id: ScreenId) => void }) {
  const { profile, phase, batch, done, stopReason, frozen, roundSize, submitAnswer, loading, error } =
    useSession();

  // The visible question is intentionally decoupled from the live `batch`
  // — it only advances through pick() below, on our own timing, so there's
  // always something on screen to play the exit/enter transition against
  // instead of the text just snapping to the next question mid-animation.
  const [view, setView] = useState<View>({ kind: "loading" });
  const [progress, setProgress] = useState({ answeredInRound: 0, roundStartSize: 0 });
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [cardPhase, setCardPhase] = useState<"visible" | "exiting" | "entering">("visible");
  const [hasSynced, setHasSynced] = useState(false);

  // Always-current refs for batch/done/roundSize, so pick() (below) can
  // read the freshest values after an await without relying on a stale
  // closure — see the comment inside pick() for why this is needed.
  const batchRef = useRef(batch);
  const doneRef = useRef(done);
  const roundSizeRef = useRef(roundSize);
  useEffect(() => {
    batchRef.current = batch;
    doneRef.current = done;
    roundSizeRef.current = roundSize;
  }, [batch, done, roundSize]);

  // Sync once, the first time real data is available (initial load, or a
  // resumed session) — after that, `view`/`progress` only change through
  // pick() below, so the animation timing stays fully under our control.
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

    // Instant, uniform feedback the moment you tap — identical treatment
    // for whichever option was picked (only optionId differs, never the
    // animation/copy), then the card holds for a fixed beat before
    // advancing so the tap always feels acknowledged, not just skipped
    // past. Deliberately answer-agnostic throughout — research on gamified
    // surveys ties per-answer-differentiated feedback to response bias, so
    // nothing here (timing, motion, copy) is allowed to vary by which
    // option was picked.
    setSelectedOptionId(optionId);
    setCardPhase("exiting");

    // Run the real request and the minimum hold time in parallel — a fast
    // network doesn't shortcut the animation, and a slow one doesn't make
    // it feel broken; either way the transition plays for the same
    // TRANSITION_MS before the next question appears.
    try {
      await Promise.all([submitAnswer(question.id, optionId), new Promise((r) => setTimeout(r, TRANSITION_MS))]);
    } catch {
      // submitAnswer() already recorded the failure in SessionContext (the
      // error banner above is already showing it) — just restore the card
      // instead of leaving it faded out and every option permanently
      // disabled with no way to retry.
      setSelectedOptionId(null);
      setCardPhase("visible");
      return;
    }

    // Read via ref, not the `batch`/`done`/`roundSize` captured in this
    // closure at render time — submitAnswer() above resolves only after
    // SessionContext's refresh() has already updated those, but this
    // async function still holds the values from when pick() was called,
    // not the live ones. The refs (kept current by the effect above) give
    // us the post-refresh state instead of a stale snapshot.
    const nextBatch = batchRef.current;
    const nextRoundStartSize = roundSizeRef.current || nextBatch.length;
    setProgress({
      answeredInRound: Math.max(0, nextRoundStartSize - nextBatch.length),
      roundStartSize: nextRoundStartSize,
    });
    setView(nextBatch.length > 0 ? { kind: "question", question: nextBatch[0] } : { kind: "complete" });
    setSelectedOptionId(null);

    // Two-step class flip: render the new card already in its "entering"
    // (invisible, offset) CSS state with no transition, then flip to
    // "visible" on the next frame so the browser actually animates the
    // change instead of the state swap happening instantaneously.
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
