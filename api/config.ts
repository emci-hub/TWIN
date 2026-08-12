// /api/config.ts — everything that can change independently of content
// lives here or in env vars, never inline in route/provider logic. See
// docs/CORE.md's "no hardcoded config" rule. Model names/versions in
// particular change often (a provider renames or retires one) — this file
// is the only place that should need editing when that happens.

export type LlmProvider = "anthropic" | "openrouter" | "mock";

export interface ProviderLimits {
  requests_per_minute: number;
  requests_per_day: number;
}

export interface ProviderConfig {
  model: string;
  base_url: string;
  limits: ProviderLimits;
}

// Verify these model ids against each provider's current docs before
// deploying — override via env var without touching code either way.
export const PROVIDERS: Record<LlmProvider, ProviderConfig> = {
  anthropic: {
    model: process.env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-20241022",
    base_url: process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com",
    limits: {
      requests_per_minute: Number(process.env.ANTHROPIC_RPM ?? 5),
      requests_per_day: Number(process.env.ANTHROPIC_RPD ?? 100),
    },
  },
  openrouter: {
    model: process.env.OPENROUTER_MODEL ?? "meta-llama/llama-3.1-8b-instruct:free",
    base_url: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
    limits: {
      requests_per_minute: Number(process.env.OPENROUTER_RPM ?? 20),
      requests_per_day: Number(process.env.OPENROUTER_RPD ?? 200),
    },
  },
  // Canned, no-network replies — used for local dev/CI/the full-quiz test
  // script so nothing ever calls a real provider (or spends real money)
  // just from running tests. Goes through the exact same quota guard and
  // rate limiter as the real providers, so that logic gets tested for real
  // without needing an API key. Never select "mock" in production.
  mock: {
    model: "mock-echo",
    base_url: "local",
    limits: {
      requests_per_minute: Number(process.env.MOCK_RPM ?? 100),
      requests_per_day: Number(process.env.MOCK_RPD ?? 1000),
    },
  },
};

export const ACTIVE_PROVIDER: LlmProvider =
  (process.env.LLM_PROVIDER as LlmProvider | undefined) ?? "mock";

// Extra safety net specifically for the anthropic path, protecting the
// Claude build credit from an unattended runaway loop — separate from (and
// on top of) anthropic's own requests_per_day limit above.
export const ANTHROPIC_HARD_DAILY_CAP = Number(process.env.ANTHROPIC_HARD_DAILY_CAP ?? 50);

export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? null;
export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? null;

export const TWIN_CHAT_MAX_MESSAGE_LENGTH = Number(
  process.env.TWIN_CHAT_MAX_MESSAGE_LENGTH ?? 500,
);

// Inbound abuse protection on /twin/chat (express-rate-limit) — separate
// concern from the outbound quota guard above; this caps how often ONE
// client can hit the route at all, regardless of provider quota.
export const INBOUND_RATE_LIMIT = {
  window_ms: Number(process.env.TWIN_CHAT_RATE_LIMIT_WINDOW_MS ?? 60_000),
  max_requests: Number(process.env.TWIN_CHAT_RATE_LIMIT_MAX ?? 10),
};

// Any client-side retry logic (see /api/scripts/test-full-quiz.ts) must cap
// at this many attempts — never unbounded/infinite.
export const CLIENT_MAX_RETRY_ATTEMPTS = Number(process.env.CLIENT_MAX_RETRY_ATTEMPTS ?? 3);

export const PORT = Number(process.env.PORT ?? 3001);

// Unset => the store falls back to an in-memory implementation (see
// store.ts). Production (Phase 7) sets this to the Supabase connection
// string.
export const DATABASE_URL = process.env.DATABASE_URL || null;
