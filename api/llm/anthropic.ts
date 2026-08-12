import { PROVIDERS, ANTHROPIC_API_KEY } from "../config.js";
import type { TwinReplyGenerator } from "./types.js";

export const generateAnthropicReply: TwinReplyGenerator = async (systemPrompt, message) => {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set — cannot call the anthropic provider");
  }
  const cfg = PROVIDERS.anthropic;

  const res = await fetch(`${cfg.base_url}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 400,
      system: systemPrompt,
      messages: [{ role: "user", content: message }],
    }),
  });

  if (!res.ok) {
    throw new Error(`anthropic call failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const reply = data.content?.find((block) => block.type === "text")?.text ?? "";

  return { reply, provider: "anthropic", model: cfg.model };
};
