import { describe, it, expect } from "vitest";
import {
  PROVIDERS,
  ACTIVE_PROVIDER,
  ANTHROPIC_HARD_DAILY_CAP,
  TWIN_CHAT_MAX_MESSAGE_LENGTH,
  INBOUND_RATE_LIMIT,
  CLIENT_MAX_RETRY_ATTEMPTS,
} from "./config.js";

describe("config defaults (no env overrides in the test environment)", () => {
  it("defaults to the mock provider — never a real one by accident", () => {
    expect(ACTIVE_PROVIDER).toBe("mock");
  });

  it("defines limits for all three providers", () => {
    for (const provider of ["anthropic", "openrouter", "mock"] as const) {
      expect(PROVIDERS[provider].limits.requests_per_minute).toBeGreaterThan(0);
      expect(PROVIDERS[provider].limits.requests_per_day).toBeGreaterThan(0);
      expect(PROVIDERS[provider].model).toBeTruthy();
    }
  });

  it("has a sane anthropic hard daily cap, at or below its own requests_per_day", () => {
    expect(ANTHROPIC_HARD_DAILY_CAP).toBeGreaterThan(0);
    expect(ANTHROPIC_HARD_DAILY_CAP).toBeLessThanOrEqual(PROVIDERS.anthropic.limits.requests_per_day);
  });

  it("caps message length and client retries to finite, positive numbers", () => {
    expect(TWIN_CHAT_MAX_MESSAGE_LENGTH).toBeGreaterThan(0);
    expect(CLIENT_MAX_RETRY_ATTEMPTS).toBeGreaterThan(0);
    expect(CLIENT_MAX_RETRY_ATTEMPTS).toBeLessThanOrEqual(10); // sanity: never "unbounded"
  });

  it("has a positive inbound rate limit window and max", () => {
    expect(INBOUND_RATE_LIMIT.window_ms).toBeGreaterThan(0);
    expect(INBOUND_RATE_LIMIT.max_requests).toBeGreaterThan(0);
  });
});
