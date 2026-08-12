// Express app factory. Never reimplements /core's logic — every route just
// calls into it. See docs/CORE.md: "Scoring + twin logic live in /core
// only, behind an API."

import express, { type Express } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { QuizSession, compileTwinPrompt } from "../core/index.js";
import type { Store } from "./store.js";
import { checkAndReserveQuota } from "./quota-guard.js";
import { generateTwinReply } from "./llm/index.js";
import { ACTIVE_PROVIDER, TWIN_CHAT_MAX_MESSAGE_LENGTH, INBOUND_RATE_LIMIT } from "./config.js";

/**
 * Raw answers are the source of truth (docs/CORE.md) — this rebuilds the
 * in-memory QuizSession by replaying a session's stored answers in order,
 * rather than trusting any cached profile as real state.
 *
 * Important: a `currentBatch()` call must be interleaved after every
 * replayed answer, not just once at the end. QuizSession only advances from
 * one batch to the next when `currentBatch()` finds an empty queue — that's
 * exactly what happens once per real request (answer, then read the next
 * batch to return it). Replaying answers back-to-back without that
 * interleaved call would leave the queue never refilled mid-replay, so the
 * session would only ever "catch up" by one batch transition, not the many
 * that actually happened — producing a different batch than the one the
 * original live session had. Mirroring the exact (answer, currentBatch)
 * pairing from the live flow reconstructs the identical state.
 */
async function rebuildSession(store: Store, sessionId: string): Promise<QuizSession> {
  const answers = await store.listAnswers(sessionId);
  const session = new QuizSession();
  for (const a of answers) {
    session.answer(a.question_id, a.option_id);
    session.currentBatch();
  }
  return session;
}

export function createServer(store: Store): Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "100kb" }));

  const twinChatLimiter = rateLimit({
    windowMs: INBOUND_RATE_LIMIT.window_ms,
    limit: INBOUND_RATE_LIMIT.max_requests,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "too many requests — slow down and try again shortly" },
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true, provider: ACTIVE_PROVIDER });
  });

  app.post("/session", async (_req, res) => {
    const sessionRow = await store.createSession();
    const quiz = new QuizSession();
    const batch = quiz.currentBatch();
    res.json({
      session_id: sessionRow.id,
      phase: quiz.phaseName,
      batch,
      profile: quiz.profile,
      done: quiz.isDone,
    });
  });

  app.post("/answer", async (req, res) => {
    const { session_id, question_id, option_id } = req.body ?? {};
    if (!session_id || !question_id || !option_id) {
      res.status(400).json({ error: "session_id, question_id, and option_id are required" });
      return;
    }

    const sessionRow = await store.getSession(session_id);
    if (!sessionRow) {
      res.status(404).json({ error: "unknown session_id" });
      return;
    }

    const quiz = await rebuildSession(store, session_id);

    if (quiz.isDone) {
      res.status(409).json({
        error: "this session already reached its stop rule — no more answers accepted",
        stop_reason: quiz.stopReason,
        profile: quiz.profile,
      });
      return;
    }

    const currentBatch = quiz.currentBatch();
    if (!currentBatch.some((q) => q.id === question_id)) {
      res.status(400).json({ error: `question ${question_id} is not in the current batch` });
      return;
    }

    let gateResult;
    try {
      gateResult = quiz.answer(question_id, option_id);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "invalid answer" });
      return;
    }

    await store.appendAnswer(session_id, { question_id, option_id, source: "quiz" });
    await store.saveProfileSnapshot(session_id, quiz.profile);

    const nextBatch = quiz.currentBatch();
    res.json({
      profile: quiz.profile,
      gate_result: gateResult,
      next_question: nextBatch[0] ?? null,
      batch: nextBatch,
      phase: quiz.phaseName,
      done: quiz.isDone,
      stop_reason: quiz.stopReason,
    });
  });

  app.post("/compile", async (req, res) => {
    const { session_id } = req.body ?? {};
    if (!session_id) {
      res.status(400).json({ error: "session_id is required" });
      return;
    }

    const sessionRow = await store.getSession(session_id);
    if (!sessionRow) {
      res.status(404).json({ error: "unknown session_id" });
      return;
    }

    const quiz = await rebuildSession(store, session_id);
    const compiled = compileTwinPrompt(quiz.profile);
    res.json(compiled);
  });

  app.post("/twin/chat", twinChatLimiter, async (req, res) => {
    const { session_id, message } = req.body ?? {};

    if (!session_id || typeof message !== "string" || message.trim().length === 0) {
      res.status(400).json({ error: "session_id and a non-empty message are required" });
      return;
    }
    if (message.length > TWIN_CHAT_MAX_MESSAGE_LENGTH) {
      res.status(400).json({
        error: `message too long — max ${TWIN_CHAT_MAX_MESSAGE_LENGTH} characters`,
      });
      return;
    }

    const sessionRow = await store.getSession(session_id);
    if (!sessionRow) {
      res.status(404).json({ error: "unknown session_id" });
      return;
    }

    // Outbound quota guard — runs BEFORE the provider is ever called.
    const quota = checkAndReserveQuota();
    if (!quota.allowed) {
      res.status(429).json({ error: "twin's resting, try again shortly", reason: quota.reason });
      return;
    }

    const quiz = await rebuildSession(store, session_id);

    try {
      const result = await generateTwinReply(quiz.profile, message);
      res.json(result);
    } catch (err) {
      res.status(502).json({
        error: "the twin's AI provider failed to respond — try again shortly",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return app;
}
