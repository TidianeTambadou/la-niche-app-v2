import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { getOwnerShopId, jsonError, jsonOk } from "@/lib/auth-server";

export const runtime = "nodejs";

type PatchBody = {
  name?: string;
  brand?: string;
  family?: string | null;
  topNotes?: string[];
  heartNotes?: string[];
  baseNotes?: string[];
  accords?: string[];
  description?: string | null;
  imageUrl?: string | null;
  priceEur?: number | null;
  inStock?: boolean;
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
  if (body.name !== undefined) update.name = body.name.trim();
  if (body.brand !== undefined) update.brand = body.brand.trim();
  if (body.family !== undefined) update.family = body.family;
  if (body.topNotes !== undefined) update.top_notes = body.topNotes;
  if (body.heartNotes !== undefined) update.heart_notes = body.heartNotes;
  if (body.baseNotes !== undefined) update.base_notes = body.baseNotes;
  if (body.accords !== undefined) update.accords = body.accords;
  if (body.description !== undefined) update.description = body.description;
  if (body.imageUrl !== undefined) update.image_url = body.imageUrl;
  if (body.priceEur !== undefined) update.price_eur = body.priceEur;
  if (typeof body.inStock === "boolean") update.in_stock = body.inStock;

  if (Object.keys(update).length === 0) return jsonError("nothing_to_update", 400);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("shop_perfumes")
    .update(update)
    .eq("id", id)
    .eq("shop_id", shopId)
    .select("*")
    .maybeSingle();

  if (error) return jsonError("db_error", 500, error.message);
  if (!data) return jsonError("not_found", 404);
  return jsonOk({ perfume: data });
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
    .from("shop_perfumes")
    .delete()
    .eq("id", id)
    .eq("shop_id", shopId);

  if (error) return jsonError("db_error", 500, error.message);
  return jsonOk({ ok: true });
}
