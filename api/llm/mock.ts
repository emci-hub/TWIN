// No network call, no cost — used for local dev, CI, and the full-quiz test
// script. Still goes through the exact same quota guard and rate limiter as
// the real providers in server.ts, so that logic is exercised for real.

import { PROVIDERS } from "../config.js";
import type { TwinReplyGenerator } from "./types.js";

export const generateMockReply: TwinReplyGenerator = async (systemPrompt, message) => {
  const preview = message.length > 80 ? `${message.slice(0, 80)}…` : message;
  return {
    reply: `[mock twin reply] You said: "${preview}" — canned response, no real provider called.`,
    provider: "mock",
    model: PROVIDERS.mock.model,
  };
};
