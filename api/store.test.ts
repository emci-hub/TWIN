import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MemoryStore, PostgresStore } from "./store.js";
import { closePool } from "./db.js";

describe("MemoryStore", () => {
  it("creates a session and starts with no answers", async () => {
    const store = new MemoryStore();
    const session = await store.createSession();
    expect(session.id).toBeTruthy();
    expect(session.frozen).toBe(false);
    expect(await store.listAnswers(session.id)).toEqual([]);
  });

  it("returns null for an unknown session id", async () => {
    const store = new MemoryStore();
    expect(await store.getSession("not-a-real-id")).toBeNull();
  });

  it("appends answers in order and preserves it on read", async () => {
    const store = new MemoryStore();
    const session = await store.createSession();
    await store.appendAnswer(session.id, { question_id: "q01", option_id: "a", source: "quiz" });
    await store.appendAnswer(session.id, { question_id: "q05", option_id: "b", source: "quiz" });

    const answers = await store.listAnswers(session.id);
    expect(answers.map((a) => a.question_id)).toEqual(["q01", "q05"]);
  });

  it("throws when appending an answer to an unknown session", async () => {
    const store = new MemoryStore();
    await expect(
      store.appendAnswer("not-a-real-id", { question_id: "q01", option_id: "a", source: "quiz" }),
    ).rejects.toThrow();
  });

  it("stores a profile snapshot, retrievable via the debug helper", async () => {
    const store = new MemoryStore();
    const session = await store.createSession();
    const fakeProfile = { openness: { alpha: 1, beta: 1, value: 0.5, confidence: 0, contradiction_flag: false } };
    await store.saveProfileSnapshot(session.id, fakeProfile as never);
    expect(store.getSnapshot(session.id)).toEqual(fakeProfile);
  });

  it("freezes a session", async () => {
    const store = new MemoryStore();
    const session = await store.createSession();
    expect((await store.getSession(session.id))!.frozen).toBe(false);
    await store.freezeSession(session.id);
    expect((await store.getSession(session.id))!.frozen).toBe(true);
  });

  it("throws when freezing an unknown session", async () => {
    const store = new MemoryStore();
    await expect(store.freezeSession("not-real")).rejects.toThrow();
  });
});

// Only runs against a real database when DATABASE_URL is set — skipped
// (not failed) everywhere else, since PostgresStore needs an actual
// Postgres instance to talk to.
describe.skipIf(!process.env.DATABASE_URL)("PostgresStore (live DB)", () => {
  let store: PostgresStore;

  beforeAll(async () => {
    store = new PostgresStore();
    await store.init();
  });

  afterAll(async () => {
    await closePool();
  });

  it("creates a session in Postgres", async () => {
    const session = await store.createSession();
    expect(session.id).toBeTruthy();
    expect(session.frozen).toBe(false);
  });

  it("round-trips answers through Postgres in insertion order", async () => {
    const session = await store.createSession();
    await store.appendAnswer(session.id, { question_id: "q01", option_id: "a", source: "quiz" });
    await store.appendAnswer(session.id, { question_id: "q05", option_id: "b", source: "quiz" });

    const answers = await store.listAnswers(session.id);
    expect(answers.map((a) => a.question_id)).toEqual(["q01", "q05"]);
    expect(answers.every((a) => a.source === "quiz")).toBe(true);
  });

  it("returns null for an unknown session id", async () => {
    expect(await store.getSession("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("persists a profile snapshot", async () => {
    const session = await store.createSession();
    const fakeProfile = { openness: { alpha: 1, beta: 1, value: 0.5, confidence: 0, contradiction_flag: false } };
    await store.saveProfileSnapshot(session.id, fakeProfile as never);
    // no direct read method on the interface — just confirming it doesn't throw
    // and the row still exists afterward
    const row = await store.getSession(session.id);
    expect(row).not.toBeNull();
  });

  it("freezes a session in Postgres", async () => {
    const session = await store.createSession();
    await store.freezeSession(session.id);
    const row = await store.getSession(session.id);
    expect(row!.frozen).toBe(true);
  });
});
