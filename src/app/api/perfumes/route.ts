/**
 * /api/perfumes
 *
 *   GET   — boutique reads its own stock (latest first).
 *   POST  — boutique adds a new perfume to its stock.
 *
 * `shop_id` is always the caller's (no cross-shop writes).
 */

import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { getOwnerShopId, jsonError, jsonOk } from "@/lib/auth-server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const shopId = await getOwnerShopId(req);
  if (!shopId) return jsonError("auth_required", 401);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("shop_perfumes")
    .select("*")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false });

  if (error) return jsonError("db_error", 500, error.message);
  return jsonOk({ perfumes: data ?? [] });
}

type CreateBody = {
  name: string;
  brand: string;
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

export async function POST(req: NextRequest) {
  const shopId = await getOwnerShopId(req);
  if (!shopId) return jsonError("auth_required", 401);

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return jsonError("invalid_json", 400);
  }

  const name = (body.name ?? "").trim();
  const brand = (body.brand ?? "").trim();
  if (!name || !brand) return jsonError("missing_name_or_brand", 400);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("shop_perfumes")
    .insert({
      shop_id: shopId,
      name,
      brand,
      family: body.family ?? null,
      top_notes: body.topNotes ?? [],
      heart_notes: body.heartNotes ?? [],
      base_notes: body.baseNotes ?? [],
      accords: body.accords ?? [],
      description: body.description ?? null,
      image_url: body.imageUrl ?? null,
      price_eur: body.priceEur ?? null,
      in_stock: body.inStock ?? true,
    })
    .select("*")
    .single();

  if (error) return jsonError("db_error", 500, error.message);
  return jsonOk({ perfume: data }, 201);
}
