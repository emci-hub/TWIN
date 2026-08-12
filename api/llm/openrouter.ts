import { PROVIDERS, OPENROUTER_API_KEY } from "../config.js";
import type { TwinReplyGenerator } from "./types.js";

export const generateOpenRouterReply: TwinReplyGenerator = async (systemPrompt, message) => {
  if (!OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is not set — cannot call the openrouter provider");
  }
  const cfg = PROVIDERS.openrouter;

  const res = await fetch(`${cfg.base_url}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`openrouter call failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const reply = data.choices?.[0]?.message?.content ?? "";

  return { reply, provider: "openrouter", model: cfg.model };
};
