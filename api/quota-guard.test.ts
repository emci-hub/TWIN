import { describe, it, expect, beforeEach } from "vitest";
import { checkAndReserveQuota, resetQuotaStateForTests } from "./quota-guard.js";

beforeEach(() => {
  resetQuotaStateForTests();
});

describe("quota guard", () => {
  it("allows calls within the per-day limit and refuses once it's reached", () => {
    const limits = { requests_per_minute: 100, requests_per_day: 2 };
    const now = 1_000_000;

    expect(checkAndReserveQuota("openrouter", now, limits)).toEqual({ allowed: true, reason: null });
    expect(checkAndReserveQuota("openrouter", now, limits)).toEqual({ allowed: true, reason: null });

    const third = checkAndReserveQuota("openrouter", now, limits);
    expect(third.allowed).toBe(false);
    expect(third.reason).toBe("per-day limit reached");
  });

  it("allows calls within the per-minute limit and refuses within the same minute after that", () => {
    const limits = { requests_per_minute: 1, requests_per_day: 100 };
    const now = 1_000_000;

    expect(checkAndReserveQuota("openrouter", now, limits).allowed).toBe(true);
    const second = checkAndReserveQuota("openrouter", now + 1000, limits); // same minute window
    expect(second.allowed).toBe(false);
    expect(second.reason).toBe("per-minute limit reached");
  });

  it("resets the per-minute window after 60 seconds", () => {
    const limits = { requests_per_minute: 1, requests_per_day: 100 };
    const now = 1_000_000;

    expect(checkAndReserveQuota("openrouter", now, limits).allowed).toBe(true);
    expect(checkAndReserveQuota("openrouter", now + 61_000, limits).allowed).toBe(true);
  });

  it("resets the per-day window after 24 hours", () => {
    const limits = { requests_per_minute: 100, requests_per_day: 1 };
    const now = 1_000_000;

    expect(checkAndReserveQuota("openrouter", now, limits).allowed).toBe(true);
    expect(checkAndReserveQuota("openrouter", now + 25 * 60 * 60 * 1000, limits).allowed).toBe(true);
  });

  it("enforces the anthropic-specific hard daily cap even under its normal per-day limit", () => {
    const now = 1_000_000;
    // anthropic's default requests_per_day (100) is well above the hard cap (50 by default),
    // but we can still exercise the logic directly with a generous limits override.
    const limits = { requests_per_minute: 1000, requests_per_day: 1000 };

    let lastAllowed = true;
    for (let i = 0; i < 60; i++) {
      const result = checkAndReserveQuota("anthropic", now, limits);
      lastAllowed = result.allowed;
      if (!result.allowed) {
        expect(result.reason).toBe("anthropic hard daily cap reached");
        break;
      }
    }
    expect(lastAllowed).toBe(false);
  });

  it("tracks each provider's quota independently", () => {
    const limits = { requests_per_minute: 1, requests_per_day: 100 };
    const now = 1_000_000;

    expect(checkAndReserveQuota("openrouter", now, limits).allowed).toBe(true);
    expect(checkAndReserveQuota("openrouter", now, limits).allowed).toBe(false);
    // a different provider's counter is untouched
    expect(checkAndReserveQuota("mock", now, limits).allowed).toBe(true);
  });
});
