import { describe, it, expect, beforeEach } from "vitest";
import type { Express } from "express";
import { createServer } from "./server.js";
import { MemoryStore } from "./store.js";
import { resetQuotaStateForTests } from "./quota-guard.js";

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
