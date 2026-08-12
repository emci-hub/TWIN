// The one place the web app talks to the network. No screen calls fetch()
// directly — everything goes through here, and the API base URL comes from
// an env var (see docs/CORE.md's "no hardcoded config" rule), never a
// literal in component code.

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

// Mirrors docs/CORE.md's "no unbounded loops" rule client-side too — any
// retry here is capped, never infinite.
const MAX_RETRY_ATTEMPTS = 3;

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries transient failures (network errors, 5xx) up to MAX_RETRY_ATTEMPTS
 * times with a short backoff. 4xx responses are the caller's problem (bad
 * input, unknown session, etc.) and are never retried — retrying them would
 * just repeat the same mistake.
 */
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: { "content-type": "application/json", ...(options.headers ?? {}) },
      });

      if (!res.ok) {
        if (res.status >= 500 && attempt < MAX_RETRY_ATTEMPTS) {
          lastError = new Error(`request to ${path} failed with ${res.status}`);
          await sleep(250 * attempt);
          continue;
        }
        const body = await res.json().catch(() => ({}));
        const message =
          body && typeof body === "object" && "error" in body
            ? String((body as { error: unknown }).error)
            : `request failed (${res.status})`;
        throw new ApiError(res.status, message, body);
      }

      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      lastError = err;
      if (attempt < MAX_RETRY_ATTEMPTS) {
        await sleep(250 * attempt);
        continue;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("request failed");
}

export interface Target {
  dim: string;
  direction: "+" | "-";
  strength: "weak" | "moderate" | "strong" | "very strong";
}

export interface Option {
  id: string;
  text: string;
  targets: Target[];
}

export interface Question {
  id: string;
  type: "preference" | "situational";
  source: string;
  prompt: string;
  options: Option[];
}

export interface DimensionProfile {
  alpha: number;
  beta: number;
  value: number;
  confidence: number;
  contradiction_flag: boolean;
}

export type Profile = Record<string, DimensionProfile>;

export type StopReason = "target_confidence" | "max_questions" | "bank_exhausted" | null;

export interface ResolvedAnswer {
  question_id: string;
  option_id: string;
  source: string;
  created_at: string;
  prompt: string | null;
  chosen_text: string | null;
  targets: Target[];
}

export interface SessionState {
  session_id: string;
  profile: Profile;
  phase: "quick_start" | "sharpen" | "done";
  batch: Question[];
  done: boolean;
  stop_reason: StopReason;
  frozen: boolean;
  answers: ResolvedAnswer[];
  round_size: number;
}

export interface AnswerResult {
  profile: Profile;
  gate_result: unknown;
  next_question: Question | null;
  batch: Question[];
  phase: "quick_start" | "sharpen" | "done";
  done: boolean;
  stop_reason: StopReason;
  round_size: number;
}

export interface CompiledTwin {
  prompt: string;
  included_dimensions: string[];
  omitted_dimensions: string[];
}

export interface ChatResult {
  reply: string;
  provider: string;
  model: string;
}

export type LlmProvider = "anthropic" | "openrouter" | "mock";

export interface DimensionCopy {
  id: string;
  label: string;
  low: string;
  high: string;
}

export const api = {
  getDimensions(): Promise<{ dimensions: DimensionCopy[] }> {
    return request("/dimensions");
  },

  createSession(): Promise<SessionState> {
    return request<SessionState>("/session", { method: "POST" });
  },

  getSession(sessionId: string): Promise<SessionState> {
    return request<SessionState>(`/session/${encodeURIComponent(sessionId)}`);
  },

  freezeSession(sessionId: string): Promise<{ session_id: string; frozen: boolean }> {
    return request(`/session/${encodeURIComponent(sessionId)}/freeze`, { method: "POST" });
  },

  answer(sessionId: string, questionId: string, optionId: string): Promise<AnswerResult> {
    return request<AnswerResult>("/answer", {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId, question_id: questionId, option_id: optionId }),
    });
  },

  compile(sessionId: string): Promise<CompiledTwin> {
    return request<CompiledTwin>("/compile", {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId }),
    });
  },

  chat(sessionId: string, message: string, provider?: LlmProvider): Promise<ChatResult> {
    return request<ChatResult>("/twin/chat", {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId, message, provider }),
    });
  },
};
