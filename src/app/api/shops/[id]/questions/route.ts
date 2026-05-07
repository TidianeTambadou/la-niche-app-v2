/**
 * /api/shops/[id]/questions
 *
 *   GET — public read of a shop's questions, ordered. Used by the user-side
 *   form when a customer fills the questionnaire from their account ; no
 *   token required since it's the same data already protected by RLS
 *   `shop_questions_public_read`.
 */

import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { jsonError, jsonOk } from "@/lib/auth-server";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: shopId } = await ctx.params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("shop_questions")
    .select("id, position, label, kind, options, required")
    .eq("shop_id", shopId)
    .order("position", { ascending: true });

  if (error) return jsonError("db_error", 500, error.message);
  return jsonOk({ questions: data ?? [] });
}
