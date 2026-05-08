/**
 * /api/diagnostic
 *
 * Outil de debug pour vérifier que l'env Vercel pointe bien sur le bon
 * compte OpenRouter. Renvoie :
 *   - has_openrouter_key   : booléen, true si la var d'env existe
 *   - openrouter_key_prefix: les 12 premiers chars (jamais le secret entier)
 *   - openrouter_key_length: la longueur totale, pour différencier deux
 *                            clés qui auraient le même prefix
 *   - test_status          : le code HTTP renvoyé par un mini appel test
 *   - test_body            : la réponse brute (raccourcie à 800 chars)
 *
 * Le test envoie max_tokens=5 → coût upfront minimal, ne plombe pas le
 * wallet. Le user_id dans la réponse OpenRouter t'indique sur quel compte
 * la requête atterrit.
 *
 * Auth obligatoire (boutique) pour ne pas exposer ces métadonnées en
 * lecture publique.
 */

import type { NextRequest } from "next/server";
import { getOwnerShopId, jsonError, jsonOk } from "@/lib/auth-server";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const shopId = await getOwnerShopId(req);
  if (!shopId) return jsonError("auth_required", 401);

  const key = process.env.OPENROUTER_API_KEY;

  const out: Record<string, unknown> = {
    has_openrouter_key: !!key,
    openrouter_key_prefix: key ? key.slice(0, 12) : null,
    openrouter_key_length: key?.length ?? 0,
    has_resend_key: !!process.env.RESEND_API_KEY,
    has_twilio_sid: !!process.env.TWILIO_ACCOUNT_SID,
    node_env: process.env.NODE_ENV ?? "unknown",
  };

  if (!key) {
    return jsonOk(out);
  }

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://laniche.app",
        "X-Title": "La Niche v2 — diagnostic",
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-001",
        messages: [{ role: "user", content: "Réponds juste : ok" }],
        max_tokens: 5,
      }),
    });
    const text = await res.text();
    out.test_status = res.status;
    out.test_body = text.slice(0, 800);
  } catch (e) {
    out.test_error = e instanceof Error ? e.message : String(e);
  }

  return jsonOk(out);
}
