import { NextResponse } from "next/server";
import {
  AGENT_SYSTEM_PROMPT,
  ALLOWED_DOMAINS,
  extractJson,
  IDENTIFY_SYSTEM_PROMPT,
  SEARCH_SYSTEM_PROMPT,
  type AgentRequest,
  type AgentResponse,
  type IdentifyResult,
  type SearchCandidate,
} from "@/lib/agent";

/* -------------------------------------------------------------------------
 * Server-side LRU cache for search results (per-instance, in-memory).
 *
 * Survives between requests within the same Vercel instance — gone on cold
 * start, but in dev / under load it cuts a lot of duplicate Anthropic calls.
 * --------------------------------------------------------------------- */

type CachedSearch = { ts: number; candidates: SearchCandidate[] };
const SEARCH_CACHE = new Map<string, CachedSearch>();
const SEARCH_CACHE_MAX = 100;
const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;

function cachedSearch(key: string): SearchCandidate[] | null {
  const hit = SEARCH_CACHE.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > SEARCH_CACHE_TTL_MS) {
    SEARCH_CACHE.delete(key);
    return null;
  }
  // Touch for LRU
  SEARCH_CACHE.delete(key);
  SEARCH_CACHE.set(key, hit);
  return hit.candidates;
}

function rememberSearch(key: string, candidates: SearchCandidate[]) {
  SEARCH_CACHE.set(key, { ts: Date.now(), candidates });
  while (SEARCH_CACHE.size > SEARCH_CACHE_MAX) {
    const first = SEARCH_CACHE.keys().next().value;
    if (first === undefined) break;
    SEARCH_CACHE.delete(first);
  }
}

/**
 * POST /api/agent
 *
 * Three modes:
 *   - search:   { mode:"search",   payload:{ query } }       → top 5 fragrance candidates
 *   - identify: { mode:"identify", payload:{ imageBase64, imageMediaType } } → image → fragrance
 *   - ask:      { mode:"ask",      payload:{ question } }    → free-form expert answer
 *
 * Backend: Claude API with the `web_search` tool, restricted to the user's
 * allowed domains (Fragrantica, Basenotes, Parfumo, etc).
 *
 * Requires env var: ANTHROPIC_API_KEY (server-side only). Without it, the
 * route returns 503 and the caller falls back to local catalog behaviour.
 */

export async function POST(req: Request) {
  let body: AgentRequest;
  try {
    body = (await req.json()) as AgentRequest;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" } satisfies AgentResponse,
      { status: 400 },
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        ok: false,
        error: "agent_disabled",
        detail:
          "ANTHROPIC_API_KEY not set. Configure it in Vercel project env to enable the agent.",
      } satisfies AgentResponse,
      { status: 503 },
    );
  }

  // Build the conversation + output schema instruction depending on mode.
  // `messages` is the full Anthropic messages array. Search/identify are
  // single-turn; ask can carry prior history (for the concierge chat).
  let messages: Array<{ role: "user" | "assistant"; content: unknown }> = [];
  let outputSchema = "";

  switch (body.mode) {
    case "search": {
      const query = (body.payload?.query ?? "").trim();
      if (!query) {
        return NextResponse.json(
          { ok: true, mode: "search", candidates: [] } satisfies AgentResponse,
        );
      }
      const userContent = [
        {
          type: "text",
          text: `Autocomplete parfum, requête = "${query}". Donne 1 à 4 parfums dont le nom commence par OU contient cette requête. Tu peux te baser sur ton training (Fragrantica est dans tes données).
Pour image_url : donne l'URL de l'image du flacon sur Fragrantica si tu la connais (typiquement https://fimgs.net/mdimg/perfume/375x500.NNNNN.jpg). Sinon, omets le champ.
Ne donne PAS source_url, on le synthétise nous-mêmes.`,
        },
      ];
      outputSchema = `JSON STRICT, rien autour, max 4 candidats, champs courts :
{"candidates":[{"name":"...","brand":"...","notes_brief":"≤50 char","family":"≤30 char","image_url":"https://... (optionnel)"}]}`;
      messages = [{ role: "user", content: userContent }];
      break;
    }

    case "identify": {
      const { imageBase64, imageMediaType } = body.payload ?? {
        imageBase64: "",
        imageMediaType: "",
      };
      if (!imageBase64 || !imageMediaType) {
        return NextResponse.json(
          { ok: false, error: "missing_image" } satisfies AgentResponse,
          { status: 400 },
        );
      }
      const userContent = [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: imageMediaType,
            data: imageBase64,
          },
        },
        {
          type: "text",
          text: `Identifie le parfum présent sur cette image (flacon, packaging). Cherche sur Fragrantica pour confirmer ton identification et trouver les notes principales.`,
        },
      ];
      messages = [{ role: "user", content: userContent }];
      outputSchema = `Réponds UNIQUEMENT en JSON strict, schéma :
{
  "name": "string",
  "brand": "string",
  "confidence": 0.0_to_1.0,
  "notes_brief": "string ≤ 80 caractères",
  "source_url": "URL Fragrantica"
}
Si tu ne peux pas identifier avec certitude, retourne :
{ "error": "unidentified" }`;
      break;
    }

    case "ask": {
      const question = (body.payload?.question ?? "").trim();
      if (!question) {
        return NextResponse.json(
          { ok: false, error: "missing_question" } satisfies AgentResponse,
          { status: 400 },
        );
      }
      // Multi-turn: prepend prior history (oldest first), then the new user
      // question. Cap to the last ~10 turns to keep token usage bounded on
      // long chats — the system prompt + web_search results already eat a
      // lot of the budget.
      const history = body.payload?.history ?? [];
      const recent = history.slice(-10);
      messages = [
        ...recent.map((t) => ({
          role: t.role,
          content: [{ type: "text", text: t.content }],
        })),
        { role: "user", content: [{ type: "text", text: question }] },
      ];
      outputSchema = ""; // Free-form Markdown answer.
      break;
    }

    default:
      return NextResponse.json(
        { ok: false, error: "invalid_mode" } satisfies AgentResponse,
        { status: 400 },
      );
  }

  // Use compact system prompts for the structured modes — saves ~500 input
  // tokens per call vs. the full expert prompt. The full prompt is reserved
  // for the free-form chat ("ask") where the expert framing matters.
  const baseSystem =
    body.mode === "search"
      ? SEARCH_SYSTEM_PROMPT
      : body.mode === "identify"
        ? IDENTIFY_SYSTEM_PROMPT
        : AGENT_SYSTEM_PROMPT;
  const systemPrompt = outputSchema
    ? `${baseSystem}\n\n# FORMAT DE SORTIE\n${outputSchema}`
    : baseSystem;

  // Use Haiku 4.5 for the high-volume autocomplete mode (cheaper + much
  // higher rate limits). Sonnet 4.6 stays for image identification (vision
  // quality matters) and free-form expert chat (depth matters).
  const model =
    body.mode === "search"
      ? "claude-haiku-4-5-20251001"
      : "claude-sonnet-4-6";

  // Anthropic Messages API call with web_search tool restricted to allowed
  // domains. The tool name + version may need bumping over time; check the
  // Anthropic docs and update `web_search_20250305` accordingly.
  // Server-side cache check for search mode (cheapest path: no Anthropic call).
  if (body.mode === "search") {
    const cached = cachedSearch(body.payload.query.trim().toLowerCase());
    if (cached) {
      return NextResponse.json(
        { ok: true, mode: "search", candidates: cached } satisfies AgentResponse,
      );
    }
  }

  // web_search is the main token-eater (each fetched page = thousands of
  // input tokens). For autocomplete we don't need it — Claude's training
  // already covers Fragrantica well. We keep it for identify (vision must
  // be confirmed) and ask (chat needs fresh data).
  const useWebSearch = body.mode !== "search";

  let upstream: Response;
  try {
    upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens:
          body.mode === "search"
            ? 800
            : body.mode === "identify"
              ? 700
              : 1500,
        system: systemPrompt,
        ...(useWebSearch
          ? {
              tools: [
                {
                  type: "web_search_20250305",
                  name: "web_search",
                  max_uses: body.mode === "identify" ? 2 : 3,
                  allowed_domains: [...ALLOWED_DOMAINS],
                },
              ],
              tool_choice:
                body.mode === "identify"
                  ? { type: "any" }
                  : { type: "auto" },
            }
          : {}),
        messages,
      }),
    });
  } catch (e: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: "upstream_unreachable",
        detail: e instanceof Error ? e.message : String(e),
      } satisfies AgentResponse,
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => "");
    // eslint-disable-next-line no-console
    console.error(
      `[agent] Anthropic ${upstream.status}:`,
      errText.slice(0, 1000),
    );
    return NextResponse.json(
      {
        ok: false,
        error: "upstream_error",
        detail: `${upstream.status} ${errText.slice(0, 500)}`,
      } satisfies AgentResponse,
      { status: 502 },
    );
  }

  const data = (await upstream.json()) as {
    content?: Array<{ type: string; text?: string }>;
    stop_reason?: string;
  };

  // The content array may contain web_search tool_use + tool_result blocks
  // followed by the final text. Concatenate ALL text blocks (some models emit
  // multiple) so we never miss the JSON payload.
  const text = (data.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("\n")
    .trim();

  // Always log a short preview server-side for debugging.
  // eslint-disable-next-line no-console
  console.log(
    `[agent] mode=${body.mode} stop=${data.stop_reason ?? "?"} text_len=${text.length} preview="${text.slice(0, 200).replace(/\n/g, " ")}"`,
  );

  if (body.mode === "ask") {
    return NextResponse.json(
      { ok: true, mode: "ask", answer: text } satisfies AgentResponse,
    );
  }

  // Parse JSON for structured modes
  try {
    const parsed = extractJson(text) as Record<string, unknown>;

    if (body.mode === "search") {
      const raw = (parsed.candidates ?? []) as Array<
        Partial<SearchCandidate>
      >;
      // Synthesize a deterministic Fragrantica search URL — always valid,
      // never hallucinated. The user lands on Fragrantica's search page
      // with the brand+name pre-filled.
      const candidates: SearchCandidate[] = raw
        .filter((c) => c.name && c.brand)
        .map((c) => {
          // Image URL: trust Claude if it gave one and it looks like a real
          // image URL; fallback to a deterministic placeholder otherwise.
          // The frontend handles 404s gracefully via onError.
          const claimedImage = (c.image_url ?? "").trim();
          const looksLikeImage =
            /^https?:\/\/.+\.(jpe?g|png|webp|gif)(\?.*)?$/i.test(claimedImage);
          const fallbackImage = `https://placehold.co/300x400/0a0a0a/e2e2e2?font=montserrat&text=${encodeURIComponent(c.name!)}`;
          return {
            name: c.name!,
            brand: c.brand!,
            notes_brief: c.notes_brief ?? "",
            source_url: `https://www.fragrantica.com/search/?query=${encodeURIComponent(`${c.brand} ${c.name}`)}`,
            family: c.family,
            image_url: looksLikeImage ? claimedImage : fallbackImage,
          };
        });
      // Cache for next request (same query within 10 min skips Anthropic).
      rememberSearch(body.payload.query.trim().toLowerCase(), candidates);
      return NextResponse.json(
        { ok: true, mode: "search", candidates } satisfies AgentResponse,
      );
    }

    if (body.mode === "identify") {
      if (parsed.error === "unidentified") {
        return NextResponse.json(
          { ok: true, mode: "identify", result: null } satisfies AgentResponse,
        );
      }
      return NextResponse.json(
        {
          ok: true,
          mode: "identify",
          result: parsed as unknown as IdentifyResult,
        } satisfies AgentResponse,
      );
    }
  } catch (e: unknown) {
    // eslint-disable-next-line no-console
    console.error(
      `[agent] parse_error mode=${body.mode}:`,
      e instanceof Error ? e.message : String(e),
      "\n--- RAW TEXT FROM CLAUDE ---\n",
      text,
      "\n----------------------------",
    );
    return NextResponse.json(
      {
        ok: false,
        error: "parse_error",
        detail: `${e instanceof Error ? e.message : String(e)} | raw (${text.length} chars): ${text.slice(0, 800)}`,
      } satisfies AgentResponse,
      { status: 500 },
    );
  }

  return NextResponse.json(
    { ok: false, error: "unhandled" } satisfies AgentResponse,
    { status: 500 },
  );
}
