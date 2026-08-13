// Builds a "social read" — a personality-dimension read produced from text
// a user pastes about themselves (their own bio, messages, or posts) —
// completely separate from the quiz's real alpha/beta evidence. Reuses the
// same provider dispatch/config and the app's real dimension content
// instead of a parallel hardcoded copy of trait ids/labels/axis text (see
// docs/CORE.md's "no hardcoded content" rule). This never writes to a
// session's actual profile — the caller (server.ts) is responsible for
// keeping the result labeled as a separate "AI read" and out of any stored
// evidence. Consent (this being the user's own content) is enforced by the
// route, not here.

import { DIMENSIONS_CONTENT } from "../../core/index.js";
import { PROVIDERS, ANTHROPIC_API_KEY, OPENROUTER_API_KEY, ACTIVE_PROVIDER, type LlmProvider } from "../config.js";

export interface SocialReadEntry {
  value: number;
  note: string;
}

export type SocialRead = Record<string, SocialReadEntry>;

export interface SocialReadResult {
  read: SocialRead;
  provider: string;
  model: string;
}

const DIMENSION_IDS = DIMENSIONS_CONTENT.map((d) => d.id);

function buildSystemPrompt(): string {
  const lines = DIMENSIONS_CONTENT.map((d) => `- ${d.id}: 0.0 = "${d.low}" ... 1.0 = "${d.high}"`).join("\n");
  const shape = DIMENSION_IDS.map((id) => `"${id}": { "value": 0.0, "note": "..." }`).join(", ");
  return [
    "You are producing a casual, best-effort personality read from a piece of text the user wrote about themselves (their own bio, messages, or posts). This is NOT a clinical or diagnostic assessment, and the result must read as clearly speculative, never authoritative.",
    "",
    "Score the text on exactly these dimensions, each a 0.0-1.0 scale:",
    lines,
    "",
    "Rules:",
    "- Base every value only on evidence actually present in the text below — never invent detail that isn't there.",
    "- If the text gives no real signal for a dimension, use 0.5 and say so in that dimension's note.",
    "- Respond with ONLY a single JSON object, no prose, no markdown code fences, in exactly this shape:",
    `{ ${shape} }`,
    "- Each note is one short sentence, under 140 characters, naming what in the text supports the score (or that there was no signal).",
  ].join("\n");
}

function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  // Defensive: strip a markdown fence if a provider added one anyway
  // (models don't always follow formatting instructions exactly).
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const jsonText = fenced ? fenced[1] : trimmed;
  return JSON.parse(jsonText);
}

function normalizeRead(parsed: unknown): SocialRead {
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("AI response was not a JSON object");
  }
  const source = parsed as Record<string, unknown>;
  const read: SocialRead = {};
  for (const id of DIMENSION_IDS) {
    const entry = source[id];
    const hasEntry = typeof entry === "object" && entry !== null;
    const rawValue = hasEntry ? Number((entry as Record<string, unknown>).value) : NaN;
    const rawNote = hasEntry ? String((entry as Record<string, unknown>).note ?? "") : "";
    const value = Number.isFinite(rawValue) ? Math.min(1, Math.max(0, rawValue)) : 0.5;
    const note = rawNote.slice(0, 200) || "No note returned.";
    read[id] = { value, note };
  }
  return read;
}

async function callProviderRaw(
  provider: Exclude<LlmProvider, "mock">,
  systemPrompt: string,
  text: string,
): Promise<{ raw: string; model: string }> {
  if (provider === "anthropic") {
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
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: "user", content: text }],
      }),
    });
    if (!res.ok) {
      throw new Error(`anthropic call failed: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const raw = data.content?.find((block) => block.type === "text")?.text ?? "";
    return { raw, model: cfg.model };
  }

  // openrouter
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
        { role: "user", content: text },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`openrouter call failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = data.choices?.[0]?.message?.content ?? "";
  return { raw, model: cfg.model };
}

/**
 * Analyzes user-pasted text into a same-shaped-but-separate read across the
 * app's real 12 dimensions. The mock provider returns an obvious, clearly
 * labeled placeholder (never a fabricated-but-plausible-looking "real"
 * read) — important because production can run with LLM_PROVIDER=mock, and
 * this must never be mistaken for a genuine analysis.
 */
export async function generateSocialRead(
  text: string,
  providerOverride?: LlmProvider,
): Promise<SocialReadResult> {
  const provider = providerOverride ?? ACTIVE_PROVIDER;

  if (provider === "mock") {
    const read: SocialRead = {};
    for (const id of DIMENSION_IDS) {
      read[id] = {
        value: 0.5,
        note: "Mock provider active — this is placeholder data, not a real analysis.",
      };
    }
    return { read, provider: "mock", model: PROVIDERS.mock.model };
  }

  const systemPrompt = buildSystemPrompt();
  const { raw, model } = await callProviderRaw(provider, systemPrompt, text);

  let parsed: unknown;
  try {
    parsed = extractJson(raw);
  } catch {
    throw new Error("the AI's response wasn't valid JSON — try again");
  }

  return { read: normalizeRead(parsed), provider, model };
}
