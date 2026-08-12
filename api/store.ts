// Persistence for sessions + raw answers. Two implementations behind one
// Store interface: PostgresStore (Supabase in production) and MemoryStore
// (local dev/tests when DATABASE_URL isn't set — data doesn't survive a
// restart, which is fine for that use). Same swappable-adapter shape as
// the LLM providers in /api/llm.

import { randomUUID } from "node:crypto";
import type { Profile } from "../core/index.js";
import { getPool, applySchema } from "./db.js";
import { DATABASE_URL } from "./config.js";

export interface StoredAnswer {
  question_id: string;
  option_id: string;
  source: string;
  created_at: string;
}

export interface SessionRow {
  id: string;
  frozen: boolean;
}

export interface Store {
  createSession(): Promise<SessionRow>;
  getSession(id: string): Promise<SessionRow | null>;
  listAnswers(sessionId: string): Promise<StoredAnswer[]>;
  appendAnswer(
    sessionId: string,
    answer: { question_id: string; option_id: string; source: string },
  ): Promise<void>;
  saveProfileSnapshot(sessionId: string, profile: Profile): Promise<void>;
}

export class MemoryStore implements Store {
  private sessions = new Map<string, SessionRow>();
  private answers = new Map<string, StoredAnswer[]>();
  private snapshots = new Map<string, Profile>();

  async createSession(): Promise<SessionRow> {
    const id = randomUUID();
    const row: SessionRow = { id, frozen: false };
    this.sessions.set(id, row);
    this.answers.set(id, []);
    return row;
  }

  async getSession(id: string): Promise<SessionRow | null> {
    return this.sessions.get(id) ?? null;
  }

  async listAnswers(sessionId: string): Promise<StoredAnswer[]> {
    return this.answers.get(sessionId) ?? [];
  }

  async appendAnswer(
    sessionId: string,
    answer: { question_id: string; option_id: string; source: string },
  ): Promise<void> {
    const list = this.answers.get(sessionId);
    if (!list) throw new Error(`unknown session ${sessionId}`);
    list.push({ ...answer, created_at: new Date().toISOString() });
  }

  async saveProfileSnapshot(sessionId: string, profile: Profile): Promise<void> {
    this.snapshots.set(sessionId, profile);
  }

  /** Test/debug helper — not part of the Store interface. */
  getSnapshot(sessionId: string): Profile | undefined {
    return this.snapshots.get(sessionId);
  }
}

export class PostgresStore implements Store {
  async init(): Promise<void> {
    await applySchema();
  }

  async createSession(): Promise<SessionRow> {
    const { rows } = await getPool().query<SessionRow>(
      "insert into sessions default values returning id, frozen",
    );
    return rows[0];
  }

  async getSession(id: string): Promise<SessionRow | null> {
    const { rows } = await getPool().query<SessionRow>(
      "select id, frozen from sessions where id = $1",
      [id],
    );
    return rows[0] ?? null;
  }

  async listAnswers(sessionId: string): Promise<StoredAnswer[]> {
    const { rows } = await getPool().query<StoredAnswer>(
      "select question_id, option_id, source, created_at from answers where session_id = $1 order by id asc",
      [sessionId],
    );
    return rows;
  }

  async appendAnswer(
    sessionId: string,
    answer: { question_id: string; option_id: string; source: string },
  ): Promise<void> {
    await getPool().query(
      "insert into answers (session_id, question_id, option_id, source) values ($1, $2, $3, $4)",
      [sessionId, answer.question_id, answer.option_id, answer.source],
    );
  }

  async saveProfileSnapshot(sessionId: string, profile: Profile): Promise<void> {
    await getPool().query(
      "update sessions set profile_snapshot = $2, updated_at = now() where id = $1",
      [sessionId, JSON.stringify(profile)],
    );
  }
}

export async function createStore(): Promise<Store> {
  if (DATABASE_URL) {
    const store = new PostgresStore();
    await store.init();
    console.log("[store] using PostgresStore (DATABASE_URL set)");
    return store;
  }
  console.warn(
    "[store] DATABASE_URL not set — using in-memory store. Fine for local " +
      "dev/tests; production must set DATABASE_URL (see docs/BUILD.md Phase 7). " +
      "Data will not survive a restart.",
  );
  return new MemoryStore();
}
