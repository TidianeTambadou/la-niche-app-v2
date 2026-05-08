/**
 * Minimal OpenRouter wrapper. Server-side only — never import from a Client
 * Component. Fails fast with a clear error when the env var is missing rather
 * than silently returning empty text.
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export type LLMMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LLMOptions = {
  model?: string;
  /** Force the model to return application/json. */
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
};

/**
 * Same fallback chain that powered v1's /api/agent — when the primary is
 * rate-limited or down, OpenRouter tries the next one. Gemini 2.0 Flash
 * is the cheapest fast model with reliable JSON mode.
 */
const DEFAULT_MODELS = [
  "google/gemini-2.0-flash-001",
  "google/gemini-flash-1.5",
  "openai/gpt-4o-mini",
];

export async function chat(messages: LLMMessage[], opts: LLMOptions = {}): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY missing");

  // OpenRouter supports `models: string[]` + `route: "fallback"` for
  // auto-failover. When the caller pins a single model via opts.model
  // we honour that and skip the fallback machinery.
  const body: Record<string, unknown> = {
    messages,
    temperature: opts.temperature ?? 0.4,
    max_tokens: opts.maxTokens ?? 1500,
  };
  if (opts.model) {
    body.model = opts.model;
  } else {
    body.models = DEFAULT_MODELS;
    body.route = "fallback";
  }
  if (opts.json) body.response_format = { type: "json_object" };

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://laniche.app",
      "X-Title": "Gallery La Niche v2",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 400)}`);
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = json.choices?.[0]?.message?.content ?? "";
  if (!content) throw new Error("OpenRouter empty response");
  return content;
}

/**
 * Run an LLM call expected to return JSON. Tolerant : if the model wraps the
 * JSON in markdown fences or prose, we extract the first balanced { ... }
 * block. Throws if no parseable JSON is found.
 */
export async function chatJSON<T = unknown>(
  messages: LLMMessage[],
  opts: Omit<LLMOptions, "json"> = {},
): Promise<T> {
  const raw = await chat(messages, { ...opts, json: true });
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1)) as T;
    }
    throw new Error(`LLM returned non-JSON: ${raw.slice(0, 200)}`);
  }
}
