/**
 * /api/newsletter/preview
 *
 *   POST { perfumeId?, count, channel?, freeform? } — score les clients
 *   éligibles selon le canal choisi et renvoie un panel + un brouillon
 *   éventuel.
 *
 *   - perfumeId fourni       → mode "par parfum" : scoring olfactif +
 *                              draft IA basé sur la fiche parfum.
 *   - perfumeId absent       → mode "message libre" : on prend les
 *                              clients éligibles sans scoring olfactif,
 *                              le boutiquier rédige librement.
 *   - count = "all"          → toute la base éligible (pas de slice).
 *   - count = number         → top N (1..500).
 *   - channel = "email"|"sms"→ force le canal pour cette campagne.
 *   - channel = "both" / null→ on respecte la préférence de chaque client.
 *
 * Aucune persistance ; la ligne campaign est créée au send.
 */

import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { getOwnerShopId, jsonError, jsonOk } from "@/lib/auth-server";
import { selectAudience, type ScorableClient } from "@/lib/newsletter-scoring";
import { chat } from "@/lib/llm";
import type { ShopPerfume } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  perfumeId?: string | null;
  count: number | "all";
  channel?: "email" | "sms" | "both";
};

export async function POST(req: NextRequest) {
  const shopId = await getOwnerShopId(req);
  if (!shopId) return jsonError("auth_required", 401);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return jsonError("invalid_json", 400);
  }

  const channel = body.channel ?? "both";
  if (!["email", "sms", "both"].includes(channel)) {
    return jsonError("invalid_channel", 400);
  }

  // Normalise count : "all" stays as is ; numerics are clamped to [1, 500].
  const count: number | "all" =
    body.count === "all"
      ? "all"
      : Math.min(500, Math.max(1, Number(body.count)));

  const admin = createAdminClient();

  let perfume: ShopPerfume | null = null;
  if (body.perfumeId) {
    const { data: p, error: pErr } = await admin
      .from("shop_perfumes")
      .select("*")
      .eq("id", body.perfumeId)
      .eq("shop_id", shopId)
      .maybeSingle();
    if (pErr) return jsonError("db_error", 500, pErr.message);
    if (!p) return jsonError("perfume_not_found", 404);
    perfume = p as ShopPerfume;
  }

  const { data: clients, error: cErr } = await admin
    .from("clients_v2")
    .select(
      "id, first_name, last_name, email, phone, preferred_channel, consent_marketing, olfactive_profile",
    )
    .eq("shop_id", shopId);
  if (cErr) return jsonError("db_error", 500, cErr.message);

  const audience = await selectAudience(
    perfume,
    (clients ?? []) as ScorableClient[],
    count,
    { withReasons: !!perfume, desiredChannel: channel },
  );

  // Free-form mode → empty draft, the boutique writes it. Perfume mode →
  // we ask the LLM for a sane base they can tweak.
  let draft: { subject: string; body: string; sms: string };
  if (perfume) {
    draft = await draftCopy(perfume).catch(() => ({
      subject: `Découvrez ${perfume!.name}`,
      body: `Bonjour {{firstName}},\n\n${perfume!.name} de ${perfume!.brand} vient de retenir notre attention pour vous. Passez en boutique pour le découvrir.\n\nÀ très vite,\nLa boutique`,
      sms: `Bonjour {{firstName}}, on a un parfum pour vous : ${perfume!.name} de ${perfume!.brand}. Passez le sentir !`,
    }));
  } else {
    draft = {
      subject: "",
      body: "Bonjour {{firstName}},\n\n",
      sms: "Bonjour {{firstName}}, ",
    };
  }

  return jsonOk({
    perfume,
    audience,
    eligibleCount: audience.length,
    totalClients: clients?.length ?? 0,
    draft,
    channel,
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
