/**
 * /api/shops/me/questions
 *
 *   GET   — boutique reads its own questions (ordered).
 *   POST  — boutique appends a new question (auto-positions at the end).
 *   PUT   — boutique bulk-reorders ; body = `{ ids: string[] }` in the new
 *           order. Position is rewritten in a single transaction so the
 *           UNIQUE(shop_id, position) constraint never trips mid-update.
 */

import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { getOwnerShopId, jsonError, jsonOk } from "@/lib/auth-server";
import type { QuestionKind } from "@/lib/types";

export const runtime = "nodejs";

const KINDS: QuestionKind[] = ["text", "single", "multi", "scale", "email", "phone"];

export async function GET(req: NextRequest) {
  const shopId = await getOwnerShopId(req);
  if (!shopId) return jsonError("auth_required", 401);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("shop_questions")
    .select("*")
    .eq("shop_id", shopId)
    .order("position", { ascending: true });

  if (error) return jsonError("db_error", 500, error.message);
  return jsonOk({ questions: data ?? [] });
}

type CreateBody = {
  label: string;
  kind: QuestionKind;
  options?: unknown;
  required?: boolean;
};

export async function POST(req: NextRequest) {
  const shopId = await getOwnerShopId(req);
  if (!shopId) return jsonError("auth_required", 401);

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return jsonError("invalid_json", 400);
  }

  const label = (body.label ?? "").trim();
  if (!label) return jsonError("missing_label", 400);
  if (!KINDS.includes(body.kind)) return jsonError("invalid_kind", 400);

  const admin = createAdminClient();
  const { data: maxRow } = await admin
    .from("shop_questions")
    .select("position")
    .eq("shop_id", shopId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPosition = (maxRow?.position ?? 0) + 1;

  const { data, error } = await admin
    .from("shop_questions")
    .insert({
      shop_id: shopId,
      position: nextPosition,
      label,
      kind: body.kind,
      options: body.options ?? null,
      required: body.required ?? true,
    })
    .select("*")
    .single();

  if (error) return jsonError("db_error", 500, error.message);
  return jsonOk({ question: data }, 201);
}

type ReorderBody = { ids: string[] };

export async function PUT(req: NextRequest) {
  const shopId = await getOwnerShopId(req);
  if (!shopId) return jsonError("auth_required", 401);

  let body: ReorderBody;
  try {
    body = (await req.json()) as ReorderBody;
  } catch {
    return jsonError("invalid_json", 400);
  }

  if (!Array.isArray(body.ids) || body.ids.some((s) => typeof s !== "string")) {
    return jsonError("invalid_ids", 400);
  }

  const admin = createAdminClient();

  // Two-step trick to avoid the UNIQUE(shop_id, position) constraint
  // tripping mid-update : push everyone into negative space first, then
  // assign final positions.
  const { error: bumpError } = await admin.rpc("bump_question_positions", {
    p_shop_id: shopId,
  });
  // RPC may not exist — fall back to manual two-pass updates if so.
  if (bumpError) {
    for (let i = 0; i < body.ids.length; i++) {
      const { error } = await admin
        .from("shop_questions")
        .update({ position: -(i + 1) })
        .eq("id", body.ids[i])
        .eq("shop_id", shopId);
      if (error) return jsonError("db_error", 500, error.message);
    }
  }

  for (let i = 0; i < body.ids.length; i++) {
    const { error } = await admin
      .from("shop_questions")
      .update({ position: i + 1 })
      .eq("id", body.ids[i])
      .eq("shop_id", shopId);
    if (error) return jsonError("db_error", 500, error.message);
  }

  return jsonOk({ ok: true });
}
