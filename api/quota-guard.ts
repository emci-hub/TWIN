// Runs BEFORE every provider call — checked against /api/config.ts's limits
// for the active provider, plus (for anthropic specifically) the extra hard
// daily cap protecting the Claude build credit. Over the cap: refuse, never
// call through and hope. See docs/CORE.md's "Free-tier guardrail" rule.
//
// In-memory counters (per docs/BUILD.md Phase 5: "Postgres or in-memory
// counter is fine"). This is correct for a single instance (which is what
// Render's free tier runs); a multi-instance deployment would need a
// shared store — out of scope for the MVP.

import {
  PROVIDERS,
  ACTIVE_PROVIDER,
  ANTHROPIC_HARD_DAILY_CAP,
  type LlmProvider,
  type ProviderLimits,
} from "./config.js";

interface Window {
  windowStart: number;
  count: number;
}

interface ProviderQuotaState {
  minute: Window;
  day: Window;
}

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;

const state = new Map<string, ProviderQuotaState>();

function freshWindow(now: number): Window {
  return { windowStart: now, count: 0 };
}

function getState(provider: string, now: number): ProviderQuotaState {
  let s = state.get(provider);
  if (!s) {
    s = { minute: freshWindow(now), day: freshWindow(now) };
    state.set(provider, s);
  }
  if (now - s.minute.windowStart >= MINUTE_MS) s.minute = freshWindow(now);
  if (now - s.day.windowStart >= DAY_MS) s.day = freshWindow(now);
  return s;
}

export interface QuotaCheck {
  allowed: boolean;
  reason: string | null;
}

/**
 * Checks the active (or given) provider's quota and, if allowed, reserves
 * the call slot immediately (so two concurrent requests can't both slip
 * through under the same limit). Never calls the provider itself — that's
 * the caller's job, only after this returns { allowed: true }.
 */
export function checkAndReserveQuota(
  provider: LlmProvider = ACTIVE_PROVIDER,
  now: number = Date.now(),
  limitsOverride?: ProviderLimits,
): QuotaCheck {
  const limits = limitsOverride ?? PROVIDERS[provider].limits;
  const s = getState(provider, now);

  if (s.minute.count >= limits.requests_per_minute) {
    return { allowed: false, reason: "per-minute limit reached" };
  }
  if (s.day.count >= limits.requests_per_day) {
    return { allowed: false, reason: "per-day limit reached" };
  }
  if (provider === "anthropic" && s.day.count >= ANTHROPIC_HARD_DAILY_CAP) {
    return { allowed: false, reason: "anthropic hard daily cap reached" };
  }

  s.minute.count += 1;
  s.day.count += 1;
  return { allowed: true, reason: null };
}

/** Test-only: clears all in-memory counters. */
export function resetQuotaStateForTests(): void {
  state.clear();
}
