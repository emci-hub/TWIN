import { describe, it, expect, beforeEach } from "vitest";
import type { Express } from "express";
import { createServer } from "./server.js";
import { MemoryStore } from "./store.js";
import { resetQuotaStateForTests } from "./quota-guard.js";
import { DEFAULT_QUIZ_CONFIG } from "../core/index.js";

// LLM_PROVIDER isn't set in the test environment, so config.ts's default
// ("mock") is what's active — no real provider is ever called by these tests.

let app: Express;
let store: MemoryStore;

beforeEach(() => {
  resetQuotaStateForTests();
  store = new MemoryStore();
  app = createServer(store);
});

async function startEphemeral(app: Express) {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("failed to bind ephemeral port");
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

describe("GET /dimensions", () => {
  it("returns all 12 dimensions with label/low/high text", async () => {
    const { server, baseUrl } = await startEphemeral(app);
    try {
      const res = await fetch(`${baseUrl}/dimensions`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.dimensions.length).toBe(12);
      expect(body.dimensions[0]).toHaveProperty("id");
      expect(body.dimensions[0]).toHaveProperty("label");
      expect(body.dimensions[0]).toHaveProperty("low");
      expect(body.dimensions[0]).toHaveProperty("high");
    } finally {
      server.close();
    }
  });
});

describe("POST /session", () => {
  it("returns a session id and a Quick Start batch covering fresh, low-confidence dimensions", async () => {
    const { server, baseUrl } = await startEphemeral(app);
    try {
      const res = await fetch(`${baseUrl}/session`, { method: "POST" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.session_id).toBeTruthy();
      expect(body.phase).toBe("quick_start");
      expect(body.batch.length).toBeGreaterThan(0);
      expect(body.done).toBe(false);
      expect(body.round_size).toBe(DEFAULT_QUIZ_CONFIG.quick_start_size);
    } finally {
      server.close();
    }
  });
});

describe("POST /answer", () => {
  it("accepts an answer from the current batch and returns an updated profile", async () => {
    const { server, baseUrl } = await startEphemeral(app);
    try {
      const sessionRes = await fetch(`${baseUrl}/session`, { method: "POST" });
      const { session_id, batch } = await sessionRes.json();
      const q = batch[0];

      const answerRes = await fetch(`${baseUrl}/answer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id, question_id: q.id, option_id: q.options[0].id }),
      });
      expect(answerRes.status).toBe(200);
      const body = await answerRes.json();
      expect(body.profile[q.options[0].targets[0].dim].confidence).toBeGreaterThan(0);
      expect(body.round_size).toBe(DEFAULT_QUIZ_CONFIG.quick_start_size);
    } finally {
      server.close();
    }
  });

  it("rejects a question_id that's already been answered this session", async () => {
    const { server, baseUrl } = await startEphemeral(app);
    try {
      const sessionRes = await fetch(`${baseUrl}/session`, { method: "POST" });
      const { session_id, batch } = await sessionRes.json();
      const q = batch[0];
      const payload = JSON.stringify({ session_id, question_id: q.id, option_id: q.options[0].id });

      const first = await fetch(`${baseUrl}/answer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload,
      });
      expect(first.status).toBe(200);

      const second = await fetch(`${baseUrl}/answer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload,
      });
      expect(second.status).toBe(400);
    } finally {
      server.close();
    }
  });

  it("404s on an unknown session_id", async () => {
    const { server, baseUrl } = await startEphemeral(app);
    try {
      const res = await fetch(`${baseUrl}/answer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id: "not-real", question_id: "q01", option_id: "a" }),
      });
      expect(res.status).toBe(404);
    } finally {
      server.close();
    }
  });
});

describe("GET /session/:id", () => {
  it("returns the empty-state profile and an empty answer trail for a brand-new session", async () => {
    const { server, baseUrl } = await startEphemeral(app);
    try {
      const sessionRes = await fetch(`${baseUrl}/session`, { method: "POST" });
      const { session_id } = await sessionRes.json();

      const getRes = await fetch(`${baseUrl}/session/${session_id}`);
      expect(getRes.status).toBe(200);
      const body = await getRes.json();
      expect(body.answers).toEqual([]);
      expect(body.done).toBe(false);
      expect(body.frozen).toBe(false);
      expect(body.phase).toBe("quick_start");
    } finally {
      server.close();
    }
  });

  it("resolves stored answers back to their prompt, chosen text, and evidence targets", async () => {
    const { server, baseUrl } = await startEphemeral(app);
    try {
      const sessionRes = await fetch(`${baseUrl}/session`, { method: "POST" });
      const { session_id, batch } = await sessionRes.json();
      const q = batch[0];

      await fetch(`${baseUrl}/answer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id, question_id: q.id, option_id: q.options[0].id }),
      });

      const getRes = await fetch(`${baseUrl}/session/${session_id}`);
      const body = await getRes.json();
      expect(body.answers.length).toBe(1);
      expect(body.answers[0].question_id).toBe(q.id);
      expect(body.answers[0].prompt).toBe(q.prompt);
      expect(body.answers[0].chosen_text).toBe(q.options[0].text);
      expect(body.answers[0].targets).toEqual(q.options[0].targets);
    } finally {
      server.close();
    }
  });

  it("404s on an unknown session_id", async () => {
    const { server, baseUrl } = await startEphemeral(app);
    try {
      const res = await fetch(`${baseUrl}/session/not-real`);
      expect(res.status).toBe(404);
    } finally {
      server.close();
    }
  });

  // Regression test for a real bug caught by the Phase 6 browser smoke
  // check: /web derives its "N of M" quiz progress display from
  // round_size, and round_size must stay the round's TRUE starting size
  // (quick_start_size) even mid-round — not shrink to whatever's left in
  // the rebuilt queue, or a page refresh mid-quiz would show a wrong,
  // shrinking total instead of preserving progress.
  it("round_size stays the round's true starting size after some (but not all) answers", async () => {
    const { server, baseUrl } = await startEphemeral(app);
    try {
      const sessionRes = await fetch(`${baseUrl}/session`, { method: "POST" });
      const { session_id, batch: firstBatch } = await sessionRes.json();

      for (let i = 0; i < 3; i++) {
        const getRes = await fetch(`${baseUrl}/session/${session_id}`);
        const { batch } = await getRes.json();
        const q = batch[0];
        await fetch(`${baseUrl}/answer`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ session_id, question_id: q.id, option_id: q.options[0].id }),
        });
      }

      const getRes = await fetch(`${baseUrl}/session/${session_id}`);
      const body = await getRes.json();
      expect(body.batch.length).toBeLessThan(firstBatch.length);
      expect(body.round_size).toBe(DEFAULT_QUIZ_CONFIG.quick_start_size);
    } finally {
      server.close();
    }
  });
});

describe("POST /session/:id/freeze", () => {
  it("freezes a session and blocks further answers", async () => {
    const { server, baseUrl } = await startEphemeral(app);
    try {
      const sessionRes = await fetch(`${baseUrl}/session`, { method: "POST" });
      const { session_id, batch } = await sessionRes.json();

      const freezeRes = await fetch(`${baseUrl}/session/${session_id}/freeze`, { method: "POST" });
      expect(freezeRes.status).toBe(200);
      expect((await freezeRes.json()).frozen).toBe(true);

      const getRes = await fetch(`${baseUrl}/session/${session_id}`);
      expect((await getRes.json()).frozen).toBe(true);

      const q = batch[0];
      const answerRes = await fetch(`${baseUrl}/answer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id, question_id: q.id, option_id: q.options[0].id }),
      });
      expect(answerRes.status).toBe(409);
    } finally {
      server.close();
    }
  });

  it("404s on an unknown session_id", async () => {
    const { server, baseUrl } = await startEphemeral(app);
    try {
      const res = await fetch(`${baseUrl}/session/not-real/freeze`, { method: "POST" });
      expect(res.status).toBe(404);
    } finally {
      server.close();
    }
  });
});

describe("POST /compile", () => {
  it("compiles a valid prompt (with disclaimer) even before any answers", async () => {
    const { server, baseUrl } = await startEphemeral(app);
    try {
      const sessionRes = await fetch(`${baseUrl}/session`, { method: "POST" });
      const { session_id } = await sessionRes.json();

      const compileRes = await fetch(`${baseUrl}/compile`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id }),
      });
      expect(compileRes.status).toBe(200);
      const body = await compileRes.json();
      expect(body.prompt).toContain("probabilistic sketch");
      expect(body.included_dimensions).toEqual([]);
    } finally {
      server.close();
    }
  });
});

describe("POST /twin/chat", () => {
  it("returns a reply from the mock provider for a normal message", async () => {
    const { server, baseUrl } = await startEphemeral(app);
    try {
      const sessionRes = await fetch(`${baseUrl}/session`, { method: "POST" });
      const { session_id } = await sessionRes.json();

      const chatRes = await fetch(`${baseUrl}/twin/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id, message: "hey, what's up?" }),
      });
      expect(chatRes.status).toBe(200);
      const body = await chatRes.json();
      expect(body.provider).toBe("mock");
      expect(typeof body.reply).toBe("string");
    } finally {
      server.close();
    }
  });

  it("honors a client-chosen provider override (still the mock path, no real call)", async () => {
    const { server, baseUrl } = await startEphemeral(app);
    try {
      const sessionRes = await fetch(`${baseUrl}/session`, { method: "POST" });
      const { session_id } = await sessionRes.json();

      const chatRes = await fetch(`${baseUrl}/twin/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id, message: "hi", provider: "mock" }),
      });
      expect(chatRes.status).toBe(200);
      expect((await chatRes.json()).provider).toBe("mock");
    } finally {
      server.close();
    }
  });

  it("rejects an unrecognized provider value", async () => {
    const { server, baseUrl } = await startEphemeral(app);
    try {
      const sessionRes = await fetch(`${baseUrl}/session`, { method: "POST" });
      const { session_id } = await sessionRes.json();

      const chatRes = await fetch(`${baseUrl}/twin/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id, message: "hi", provider: "totally-not-a-provider" }),
      });
      expect(chatRes.status).toBe(400);
    } finally {
      server.close();
    }
  });

  it("rejects a message over the configured length cap", async () => {
    const { server, baseUrl } = await startEphemeral(app);
    try {
      const sessionRes = await fetch(`${baseUrl}/session`, { method: "POST" });
      const { session_id } = await sessionRes.json();

      const tooLong = "a".repeat(10_000);
      const chatRes = await fetch(`${baseUrl}/twin/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id, message: tooLong }),
      });
      expect(chatRes.status).toBe(400);
    } finally {
      server.close();
    }
  });

  it("rejects an empty message", async () => {
    const { server, baseUrl } = await startEphemeral(app);
    try {
      const sessionRes = await fetch(`${baseUrl}/session`, { method: "POST" });
      const { session_id } = await sessionRes.json();

      const chatRes = await fetch(`${baseUrl}/twin/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id, message: "   " }),
      });
      expect(chatRes.status).toBe(400);
    } finally {
      server.close();
    }
  });

  it("404s on an unknown session_id", async () => {
    const { server, baseUrl } = await startEphemeral(app);
    try {
      const chatRes = await fetch(`${baseUrl}/twin/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id: "not-real", message: "hi" }),
      });
      expect(chatRes.status).toBe(404);
    } finally {
      server.close();
    }
  });

  it("enforces the inbound rate limit — later requests in the same window get 429", async () => {
    const { server, baseUrl } = await startEphemeral(app);
    try {
      const sessionRes = await fetch(`${baseUrl}/session`, { method: "POST" });
      const { session_id } = await sessionRes.json();

      // config.ts defaults TWIN_CHAT_RATE_LIMIT_MAX to 10 requests/window;
      // fire 12 in quick succession and confirm at least one gets refused.
      const results: number[] = [];
      for (let i = 0; i < 12; i++) {
        const res = await fetch(`${baseUrl}/twin/chat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ session_id, message: `message ${i}` }),
        });
        results.push(res.status);
      }
      expect(results.filter((s) => s === 429).length).toBeGreaterThan(0);
    } finally {
      server.close();
    }
  });
});
