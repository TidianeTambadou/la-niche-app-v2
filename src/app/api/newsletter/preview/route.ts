/**
 * /api/newsletter/preview
 *
 *   POST { perfumeId, count } — runs the hybrid scoring engine on every
 *   client of the boutique, returns the top `count` matches with channel,
 *   score, and an LLM-generated one-line reason. Also drafts a default
 *   subject + body the boutique can edit before sending.
 *
 * Doesn't persist anything ; the actual campaign row is created at send
 * time so the boutique can preview as many times as they like.
 */

import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { getOwnerShopId, jsonError, jsonOk } from "@/lib/auth-server";
import { selectAudience, type ScorableClient } from "@/lib/newsletter-scoring";
import { chat } from "@/lib/llm";
import type { ShopPerfume } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = { perfumeId: string; count: number };

export async function POST(req: NextRequest) {
  const shopId = await getOwnerShopId(req);
  if (!shopId) return jsonError("auth_required", 401);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return jsonError("invalid_json", 400);
  }

  const count = Math.min(500, Math.max(1, Number(body.count)));
  if (!body.perfumeId) return jsonError("missing_perfume_id", 400);

  const admin = createAdminClient();
  const { data: perfume, error: pErr } = await admin
    .from("shop_perfumes")
    .select("*")
    .eq("id", body.perfumeId)
    .eq("shop_id", shopId)
    .maybeSingle();
  if (pErr) return jsonError("db_error", 500, pErr.message);
  if (!perfume) return jsonError("perfume_not_found", 404);

  const { data: clients, error: cErr } = await admin
    .from("clients_v2")
    .select(
      "id, first_name, last_name, email, phone, preferred_channel, consent_marketing, olfactive_profile",
    )
    .eq("shop_id", shopId);
  if (cErr) return jsonError("db_error", 500, cErr.message);

  const audience = await selectAudience(
    perfume as ShopPerfume,
    (clients ?? []) as ScorableClient[],
    count,
    { withReasons: true },
  );

  // Draft a base subject + body. Boutique can edit before sending.
  const draft = await draftCopy(perfume as ShopPerfume).catch(() => ({
    subject: `Découvrez ${(perfume as ShopPerfume).name}`,
    body: `Bonjour {{firstName}},\n\n${(perfume as ShopPerfume).name} de ${(perfume as ShopPerfume).brand} vient de retenir notre attention pour vous. Passez en boutique pour le découvrir.\n\nÀ très vite,\nLa boutique`,
    sms: `Bonjour {{firstName}}, on a un parfum pour vous : ${(perfume as ShopPerfume).name} de ${(perfume as ShopPerfume).brand}. Passez le sentir !`,
  }));

  return jsonOk({
    perfume,
    audience,
    eligibleCount: audience.length,
    totalClients: clients?.length ?? 0,
    draft,
  });
}

async function draftCopy(perfume: ShopPerfume): Promise<{ subject: string; body: string; sms: string }> {
  const raw = await chat(
    [
      {
        role: "system",
        content:
          "Tu rédiges une newsletter boutique de parfumerie de niche. Le ton est chaleureux, personnel, sans cliché commercial. Tu ne fais aucune affirmation marketing exagérée. Réponds UNIQUEMENT en JSON valide : {\"subject\":\"\",\"body\":\"\",\"sms\":\"\"}. Le `body` doit contenir le placeholder `{{firstName}}` au début. Le `sms` fait moins de 160 caractères.",
      },
      {
        role: "user",
        content: `Parfum : ${perfume.name} — ${perfume.brand}\nFamille : ${perfume.family ?? "—"}\nAccords : ${perfume.accords.join(", ") || "—"}\nNotes : ${[...perfume.top_notes, ...perfume.heart_notes, ...perfume.base_notes].join(", ") || "—"}\nDescription : ${perfume.description ?? "—"}\n\nÉcris la newsletter.`,
      },
    ],
    { temperature: 0.7, maxTokens: 800 },
  );
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("LLM draft non-JSON");
  return JSON.parse(cleaned.slice(start, end + 1));
}
