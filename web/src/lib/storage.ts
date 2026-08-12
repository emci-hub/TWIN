// Anonymous, client-side session — no signup yet (Phase 6 scope). Just a
// few small localStorage keys, all namespaced under "twinarchitect_".

import type { LlmProvider } from "./api";

const KEYS = {
  sessionId: "twinarchitect_session_id",
  name: "twinarchitect_name",
  provider: "twinarchitect_provider",
  theme: "twinarchitect_theme",
} as const;

export function getStoredSessionId(): string | null {
  return localStorage.getItem(KEYS.sessionId);
}

export function setStoredSessionId(id: string): void {
  localStorage.setItem(KEYS.sessionId, id);
}

export function clearStoredSessionId(): void {
  localStorage.removeItem(KEYS.sessionId);
}

export function getStoredName(): string {
  return localStorage.getItem(KEYS.name) ?? "";
}

export function setStoredName(name: string): void {
  localStorage.setItem(KEYS.name, name);
}

export function getStoredProvider(): LlmProvider {
  const value = localStorage.getItem(KEYS.provider);
  return value === "anthropic" || value === "openrouter" || value === "mock" ? value : "anthropic";
}

export function setStoredProvider(provider: LlmProvider): void {
  localStorage.setItem(KEYS.provider, provider);
}

export function getStoredTheme(): "light" | "dark" | null {
  const value = localStorage.getItem(KEYS.theme);
  return value === "light" || value === "dark" ? value : null;
}

export function setStoredTheme(theme: "light" | "dark"): void {
  localStorage.setItem(KEYS.theme, theme);
}
