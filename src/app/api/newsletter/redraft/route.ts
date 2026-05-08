/**
 * /api/newsletter/redraft
 *
 *   POST { perfumeId, instruction, currentSubject?, currentBody?, currentSms? }
 *
 *   Reformule l'objet / le corps du mail et le SMS d'une newsletter selon
 *   une instruction libre du boutiquier (texte ou retranscription vocale).
 *   Le perfume est récupéré côté serveur pour grounder le ton sans devoir
 *   re-balancer toute la fiche dans le prompt côté client.
 */

import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { chatJSON } from "@/lib/llm";
import { getOwnerShopId, jsonError, jsonOk } from "@/lib/auth-server";

export const runtime = "nodejs";
export const maxDuration = 30;

type Body = {
  /** Optionnel pour le mode "message libre" (pas de parfum ciblé). */
  perfumeId?: string | null;
  instruction: string;
  currentSubject?: string;
  currentBody?: string;
  currentSms?: string;
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

  const instruction = (body.instruction ?? "").trim();
  if (!instruction) return jsonError("missing_instruction", 400);

  const admin = createAdminClient();

  // Mode "par parfum" : on grounde le prompt sur la fiche parfum.
  // Mode "message libre" : pas de parfum, on demande juste à reformuler
  // selon la consigne sans ancrer sur des notes spécifiques.
  let perfumeBlock = "";
  let perfumeRule = "";
  if (body.perfumeId) {
    const { data: perfume, error: pErr } = await admin
      .from("shop_perfumes")
      .select("name, brand, family, top_notes, heart_notes, base_notes, accords, description")
      .eq("id", body.perfumeId)
      .eq("shop_id", shopId)
      .maybeSingle();
    if (pErr) return jsonError("db_error", 500, pErr.message);
    if (!perfume) return jsonError("perfume_not_found", 404);
    perfumeBlock = `Parfum :
${perfume.name} — ${perfume.brand}
Famille : ${perfume.family ?? "—"}
Accords : ${(perfume.accords as string[] | null)?.join(", ") || "—"}
Notes : ${[
      ...((perfume.top_notes as string[] | null) ?? []),
      ...((perfume.heart_notes as string[] | null) ?? []),
      ...((perfume.base_notes as string[] | null) ?? []),
    ].join(", ") || "—"}
Description : ${perfume.description ?? "—"}\n\n`;
    perfumeRule = "- Cite au moins une note ou un accord du parfum dans le corps.\n";
  }

  const systemPrompt = `Tu es la rédactrice de la newsletter d'une boutique de parfumerie de niche. Tu reformules le mail (objet + corps) et le SMS d'envoi selon une consigne du boutiquier.

CONTRAINTES :
- Garde le placeholder \`{{firstName}}\` dans le corps mail (à utiliser au moins une fois pour personnaliser).
- Le SMS fait moins de 160 caractères.
- Ton chaleureux, jamais commercial cliché ("ne ratez pas", "exclusivité incroyable" → JAMAIS).
${perfumeRule}- Respecte la consigne du boutiquier (ton, longueur, angle).

Réponds UNIQUEMENT en JSON :
{"subject":"","body":"","sms":""}`;

  const userPrompt = `${perfumeBlock}Mail actuel :
- Objet : ${body.currentSubject ?? "(aucun)"}
- Corps : ${body.currentBody ?? "(aucun)"}
SMS actuel : ${body.currentSms ?? "(aucun)"}

Consigne du boutiquier :
${instruction}

Reformule.`;

  try {
    const out = await chatJSON<{ subject: string; body: string; sms: string }>(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.7, maxTokens: 800 },
    );
    return jsonOk({
      subject: out.subject ?? body.currentSubject ?? "",
      body: out.body ?? body.currentBody ?? "",
      sms: out.sms ?? body.currentSms ?? "",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError("llm_error", 500, msg.slice(0, 400));
  }
}
