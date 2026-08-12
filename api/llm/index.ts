// generateTwinReply(profile, message) — the one function the rest of the
// API calls. Which provider actually runs is decided by LLM_PROVIDER
// (config.ts) by default; /core and /web never know which implementation is
// active. A per-call override is accepted too (Phase 6's Settings screen
// lets a person pick Claude vs. OpenRouter for their own twin chat) — it's
// still validated against the known provider list and still goes through
// the same quota guard as everything else, so the override can't bypass
// the free-tier/credit protections.

import { compileTwinPrompt, type Profile } from "../../core/index.js";
import { ACTIVE_PROVIDER, PROVIDERS, type LlmProvider } from "../config.js";
import { generateAnthropicReply } from "./anthropic.js";
import { generateOpenRouterReply } from "./openrouter.js";
import { generateMockReply } from "./mock.js";
import type { TwinReplyResult } from "./types.js";

export function isKnownProvider(value: unknown): value is LlmProvider {
  return typeof value === "string" && value in PROVIDERS;
}

export async function generateTwinReply(
  profile: Profile,
  message: string,
  providerOverride?: LlmProvider,
): Promise<TwinReplyResult> {
  const { prompt } = compileTwinPrompt(profile);
  const provider = providerOverride ?? ACTIVE_PROVIDER;

  switch (provider) {
    case "anthropic":
      return generateAnthropicReply(prompt, message);
    case "openrouter":
      return generateOpenRouterReply(prompt, message);
    case "mock":
    default:
      return generateMockReply(prompt, message);
  }
}
