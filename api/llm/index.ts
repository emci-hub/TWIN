// generateTwinReply(profile, message) — the one function the rest of the
// API calls. Which provider actually runs is decided by LLM_PROVIDER
// (config.ts); /core and /web never know which one is active.

import { compileTwinPrompt, type Profile } from "../../core/index.js";
import { ACTIVE_PROVIDER } from "../config.js";
import { generateAnthropicReply } from "./anthropic.js";
import { generateOpenRouterReply } from "./openrouter.js";
import { generateMockReply } from "./mock.js";
import type { TwinReplyResult } from "./types.js";

export async function generateTwinReply(profile: Profile, message: string): Promise<TwinReplyResult> {
  const { prompt } = compileTwinPrompt(profile);

  switch (ACTIVE_PROVIDER) {
    case "anthropic":
      return generateAnthropicReply(prompt, message);
    case "openrouter":
      return generateOpenRouterReply(prompt, message);
    case "mock":
    default:
      return generateMockReply(prompt, message);
  }
}
