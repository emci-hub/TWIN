// Express app factory. Never reimplements /core's logic — every route just
// calls into it. See docs/CORE.md: "Scoring + twin logic live in /core
// only, behind an API."

import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { QuizSession, compileTwinPrompt, QUESTION_BANK, DIMENSIONS_CONTENT } from "../core/index.js";
import type { Store, StoredAnswer } from "./store.js";
import { checkAndReserveQuota } from "./quota-guard.js";
import { generateTwinReply, isKnownProvider } from "./llm/index.js";
import { generateSocialRead } from "./llm/social-read.js";
import {
  ACTIVE_PROVIDER,
  TWIN_CHAT_MAX_MESSAGE_LENGTH,
  INBOUND_RATE_LIMIT,
  SOCIAL_READ_MAX_LENGTH,
} from "./config.js";
import { asyncHandler } from "./async-handler.js";

/**
 * Resolves each stored (question_id, option_id) pair back to the question
 * bank content — prompt, chosen option text, and the {dim, direction,
 * strength} evidence it produced. This is what powers the Results/"Why"
 * screens (Phase 6) without /web needing its own copy of question content.
 */
function resolveAnswerEvidence(answers: StoredAnswer[]) {
  return answers.map((a) => {
    const question = QUESTION_BANK.find((q) => q.id === a.question_id);
    const option = question?.options.find((o) => o.id === a.option_id);
    return {
      question_id: a.question_id,
      option_id: a.option_id,
      source: a.source,
      created_at: a.created_at,
      prompt: question?.prompt ?? null,
      chosen_text: option?.text ?? null,
      targets: option?.targets ?? [],
    };
  });
}

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

  // Same inbound-abuse shape as twinChatLimiter, kept as its own instance
  // (rate-limit state is per-route) — /twin/social-read is a separate
  // feature but hits the same kind of provider call.
  const socialReadLimiter = rateLimit({
    windowMs: INBOUND_RATE_LIMIT.window_ms,
    limit: INBOUND_RATE_LIMIT.max_requests,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "too many requests — slow down and try again shortly" },
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true, provider: ACTIVE_PROVIDER });
  });

  // Dimension labels/axis text (id/label/low/high) — a passthrough of
  // /core/content/dimensions.json, so /web can render nice trait labels
  // without keeping its own duplicate copy of that content.
  app.get("/dimensions", (_req, res) => {
    res.json({ dimensions: DIMENSIONS_CONTENT });
  });

  app.post(
    "/session",
    asyncHandler(async (_req, res) => {
      const sessionRow = await store.createSession();
      const quiz = new QuizSession();
      const batch = quiz.currentBatch();
      res.json({
        session_id: sessionRow.id,
        phase: quiz.phaseName,
        batch,
        profile: quiz.profile,
        done: quiz.isDone,
        round_size: quiz.roundSize,
      });
    }),
  );

  // Read-only — rebuilds and returns the current session state without
  // applying anything. Needed so the web app can show the real empty/filled
  // Home state, Results, the "Why" evidence trail, and resume an
  // in-progress quiz after a page refresh, all without answering a
  // question just to find out where things stand.
  app.get(
    "/session/:id",
    asyncHandler(async (req, res) => {
      const sessionId = req.params.id;
      const sessionRow = await store.getSession(sessionId);
      if (!sessionRow) {
        res.status(404).json({ error: "unknown session_id" });
        return;
      }

      const quiz = await rebuildSession(store, sessionId);
      const answers = await store.listAnswers(sessionId);

      res.json({
        session_id: sessionId,
        profile: quiz.profile,
        phase: quiz.phaseName,
        batch: quiz.currentBatch(),
        done: quiz.isDone,
        stop_reason: quiz.stopReason,
        round_size: quiz.roundSize,
        frozen: sessionRow.frozen,
        answers: resolveAnswerEvidence(answers),
      });
    }),
  );

  // Freezes a session — docs/CORE.md's "Profile freeze" rule. Stops ALL
  // further evidence (gate-approved or not) from moving the profile.
  app.post(
    "/session/:id/freeze",
    asyncHandler(async (req, res) => {
      const sessionId = req.params.id;
      const sessionRow = await store.getSession(sessionId);
      if (!sessionRow) {
        res.status(404).json({ error: "unknown session_id" });
        return;
      }
      await store.freezeSession(sessionId);
      res.json({ session_id: sessionId, frozen: true });
    }),
  );

  app.post(
    "/answer",
    asyncHandler(async (req, res) => {
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
      if (sessionRow.frozen) {
        res.status(409).json({ error: "this profile is frozen — no new evidence is being accepted" });
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
        round_size: quiz.roundSize,
      });
    }),
  );

  app.post(
    "/compile",
    asyncHandler(async (req, res) => {
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
    }),
  );

  app.post(
    "/twin/chat",
    twinChatLimiter,
    asyncHandler(async (req, res) => {
      const { session_id, message, provider } = req.body ?? {};

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
      // Optional per-call provider choice (Phase 6 Settings screen). Falls
      // back to the server's configured default when omitted/unrecognized —
      // never silently ignored, but also never trusted blindly.
      if (provider !== undefined && !isKnownProvider(provider)) {
        res.status(400).json({ error: `unknown provider "${provider}"` });
        return;
      }

      const sessionRow = await store.getSession(session_id);
      if (!sessionRow) {
        res.status(404).json({ error: "unknown session_id" });
        return;
      }

      // Outbound quota guard — runs BEFORE the provider is ever called. Keyed
      // on whichever provider will actually be used, so a client-chosen
      // provider is still fully subject to its own limits/hard cap.
      const quota = checkAndReserveQuota(provider);
      if (!quota.allowed) {
        res.status(429).json({ error: "twin's resting, try again shortly", reason: quota.reason });
        return;
      }

      const quiz = await rebuildSession(store, session_id);

      try {
        const result = await generateTwinReply(quiz.profile, message, provider);
        res.json(result);
      } catch (err) {
        res.status(502).json({
          error: "the twin's AI provider failed to respond — try again shortly",
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    }),
  );

  // "AI read" — analyzes text a user pastes about themselves (their own
  // bio/messages/posts) into a read across the same 12 dimensions, entirely
  // separate from the quiz. No session_id, and nothing here is ever
  // persisted server-side — the pasted text and the resulting read live
  // only in this response. Consent is a required, explicit field (not just
  // a client-side checkbox) so the "only your own content" rule has a real
  // enforcement point, even though it can't verify authorship itself.
  app.post(
    "/twin/social-read",
    socialReadLimiter,
    asyncHandler(async (req, res) => {
      const { text, consent, provider } = req.body ?? {};

      if (consent !== true) {
        res.status(400).json({
          error: "consent is required — this feature is for analyzing your own content only",
        });
        return;
      }
      if (typeof text !== "string" || text.trim().length === 0) {
        res.status(400).json({ error: "text is required" });
        return;
      }
      if (text.length > SOCIAL_READ_MAX_LENGTH) {
        res.status(400).json({ error: `text too long — max ${SOCIAL_READ_MAX_LENGTH} characters` });
        return;
      }
      if (provider !== undefined && !isKnownProvider(provider)) {
        res.status(400).json({ error: `unknown provider "${provider}"` });
        return;
      }

      const quota = checkAndReserveQuota(provider);
      if (!quota.allowed) {
        res.status(429).json({ error: "AI read is resting, try again shortly", reason: quota.reason });
        return;
      }

      try {
        const result = await generateSocialRead(text, provider);
        res.json(result);
      } catch (err) {
        res.status(502).json({
          error: "the AI read's provider failed to respond — try again shortly",
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    }),
  );

  // Global error handler — the tail end of the asyncHandler-wrapped routes
  // above funnels any thrown/rejected error here via next(err), instead of
  // it silently hanging the request or vanishing. Logged with console.error
  // so it shows up in the host's log tail (Render, in production — see
  // docs/DEPLOY.md), and the client gets a generic message, never a raw
  // stack trace or DB error string.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[unhandled route error]", err);
    if (res.headersSent) return;
    res.status(500).json({ error: "something went wrong on our end — try again shortly" });
  });

  return app;
}
