import { NextResponse } from "next/server";
import type { Fragrance } from "@/lib/data";
import type { OlfactiveProfile } from "@/lib/profile";
import type { WishlistEntry } from "@/lib/store";
import {
  buildRecommendationPrompt,
  mergeLlm,
  parseLlmResponse,
  recommendBaladeRoute,
  type Recommendation,
} from "@/lib/recommendation";

export const maxDuration = 60;
export const runtime = "nodejs";

/**
 * POST /api/recommend
 *
 * Input (JSON body):
 *   {
 *     shopFragrances: Fragrance[],     // the shop's stock, aggregated
 *     profile: OlfactiveProfile | null,
 *     wishlist: WishlistEntry[],
 *     timeBudgetMin: number,
 *     allFragrances?: Fragrance[],
 *     shopName?: string
 *   }
 *
 * Output: Recommendation[] (ranked, with reasons + optional LLM reason/invite)
 *
 * Behavior:
 *   - Always runs the deterministic scorer (src/lib/recommendation.ts).
 *   - If ANTHROPIC_API_KEY is set, additionally calls Claude with the built
 *     prompt and merges its reasons onto the deterministic results.
 *   - The deterministic result is ALWAYS authoritative for which keys are
 *     recommended — LLM output is treated as enrichment, never as source.
 */

type Body = {
  shopFragrances: Fragrance[];
  profile: OlfactiveProfile | null;
  wishlist: WishlistEntry[];
  timeBudgetMin: number;
  allFragrances?: Fragrance[];
  shopName?: string;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.shopFragrances) || body.shopFragrances.length === 0) {
    return NextResponse.json({ recommendations: [] });
  }

  // Deterministic layer — always runs.
  let recommendations: Recommendation[] = recommendBaladeRoute({
    shopFragrances: body.shopFragrances,
    profile: body.profile ?? null,
    wishlist: body.wishlist ?? [],
    timeBudgetMin: body.timeBudgetMin,
    allFragrances: body.allFragrances ?? [],
    shopName: body.shopName,
  });

  // LLM enrichment — opt-in via env var.
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  if (openrouterKey && recommendations.length > 0) {
    try {
      const prompt = buildRecommendationPrompt({
        shopFragrances: body.shopFragrances,
        profile: body.profile ?? null,
        wishlist: body.wishlist ?? [],
        timeBudgetMin: body.timeBudgetMin,
        allFragrances: body.allFragrances ?? [],
        shopName: body.shopName,
      });

      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${openrouterKey}`,
          "http-referer": "https://laniche.app",
          "x-title": "La Niche",
        },
        body: JSON.stringify({
          model: "google/gemini-2.0-flash-001",
          max_tokens: 1200,
          temperature: 0.4,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const text = data.choices?.[0]?.message?.content ?? "";
        if (text) {
          const parsed = parseLlmResponse(text);
          recommendations = mergeLlm(recommendations, parsed);
        }
      } else {
        // eslint-disable-next-line no-console
        console.warn("[recommend] OpenRouter call failed:", res.status);
      }
    } catch (e: unknown) {
      // eslint-disable-next-line no-console
      console.warn(
        "[recommend] LLM enrichment failed (returning deterministic):",
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  return NextResponse.json({ recommendations });
}
