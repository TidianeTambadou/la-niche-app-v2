/**
 * /api/shops/me/questions/[id]
 *
 *   PATCH  — update label / kind / options / required.
 *   DELETE — remove a question.
 *
 * Owner-only ; the WHERE clause checks `shop_id = auth.uid()` so a boutique
 * can never touch another shop's questions.
 */

import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { getOwnerShopId, jsonError, jsonOk } from "@/lib/auth-server";
import type { QuestionKind } from "@/lib/types";

export const runtime = "nodejs";

const KINDS: QuestionKind[] = ["text", "single", "multi", "scale", "email", "phone"];

type PatchBody = {
  label?: string;
  kind?: QuestionKind;
  options?: unknown;
  required?: boolean;
};

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const shopId = await getOwnerShopId(req);
  if (!shopId) return jsonError("auth_required", 401);

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return jsonError("invalid_json", 400);
  }

  const update: Record<string, unknown> = {};
  if (typeof body.label === "string") {
    const label = body.label.trim();
    if (!label) return jsonError("missing_label", 400);
    update.label = label;
  }
  if (body.kind !== undefined) {
    if (!KINDS.includes(body.kind)) return jsonError("invalid_kind", 400);
    update.kind = body.kind;
  }
  if (body.options !== undefined) update.options = body.options;
  if (typeof body.required === "boolean") update.required = body.required;

  if (Object.keys(update).length === 0) return jsonError("nothing_to_update", 400);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("shop_questions")
    .update(update)
    .eq("id", id)
    .eq("shop_id", shopId)
    .select("*")
    .maybeSingle();

  if (error) return jsonError("db_error", 500, error.message);
  if (!data) return jsonError("not_found", 404);
  return jsonOk({ question: data });
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const shopId = await getOwnerShopId(req);
  if (!shopId) return jsonError("auth_required", 401);

  const admin = createAdminClient();
  const { error } = await admin
    .from("shop_questions")
    .delete()
    .eq("id", id)
    .eq("shop_id", shopId);

  if (error) return jsonError("db_error", 500, error.message);
  return jsonOk({ ok: true });
}
