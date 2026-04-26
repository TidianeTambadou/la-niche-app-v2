/**
 * /api/boutique/stock — boutique-account stock management
 *
 * The mobile app's boutique role (= a user whose `auth.uid()` matches a row
 * in `public.shops`) imports its perfumes through this route. The server
 * fetches notes + family from Fragella so the boutique never has to type
 * them by hand. The same enrichment feeds the balade-guidée recommendation
 * engine, which scores fragrances against the user's profile using these
 * notes.
 *
 *   POST /api/boutique/stock   — add a perfume (auto-enriches notes+family)
 *   PATCH /api/boutique/stock  — re-run enrichment on an existing row
 *   DELETE /api/boutique/stock?id=… — remove a stock row
 *
 * Auth: Bearer access token from supabase.auth.getSession() in the client.
 */

import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { getFragellaPerfume, type FragellaPerfume } from "@/lib/fragella";

export const runtime = "nodejs";

type EnrichedNotes = {
  family: string | null;
  notes_top: string[];
  notes_heart: string[];
  notes_base: string[];
};

const EMPTY_ENRICHMENT: EnrichedNotes = {
  family: null,
  notes_top: [],
  notes_heart: [],
  notes_base: [],
};

function jsonOk(data: unknown, status = 200) {
  return Response.json(data, { status });
}

function jsonError(msg: string, status = 400, detail?: string) {
  return Response.json({ error: msg, ...(detail ? { detail } : {}) }, { status });
}

async function getOwnerShopId(req: NextRequest): Promise<string | null> {
  const token = req.headers.get("authorization")?.replace(/^Bearer /i, "");
  if (!token) return null;
  const admin = createAdminClient();
  const { data: u } = await admin.auth.getUser(token);
  const userId = u.user?.id;
  if (!userId) return null;
  const { data: shop } = await admin
    .from("shops")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  return shop?.id ?? null;
}

function enrichmentFromFragella(p: FragellaPerfume): EnrichedNotes {
  return {
    family: p.family,
    notes_top: p.notes.top.map((n) => n.name),
    notes_heart: p.notes.middle.map((n) => n.name),
    notes_base: p.notes.base.map((n) => n.name),
  };
}

async function enrich(brand: string, name: string): Promise<EnrichedNotes> {
  try {
    const p = await getFragellaPerfume(brand, name);
    if (!p) return EMPTY_ENRICHMENT;
    return enrichmentFromFragella(p);
  } catch {
    return EMPTY_ENRICHMENT;
  }
}

/* ─── POST: add a perfume to the boutique stock ─────────────────────────── */

export async function POST(req: NextRequest) {
  const shopId = await getOwnerShopId(req);
  if (!shopId) return jsonError("Unauthorized", 401);

  const body = (await req.json().catch(() => ({}))) as {
    brand?: unknown;
    perfume_name?: unknown;
    price?: unknown;
    quantity?: unknown;
    image_url?: unknown;
  };
  const brand = typeof body.brand === "string" ? body.brand.trim() : "";
  const perfume_name =
    typeof body.perfume_name === "string" ? body.perfume_name.trim() : "";
  if (!brand || !perfume_name) {
    return jsonError("brand and perfume_name are required");
  }

  const price =
    typeof body.price === "number" && isFinite(body.price)
      ? body.price
      : typeof body.price === "string" && body.price.trim() !== ""
        ? Number(body.price)
        : null;
  const quantity =
    typeof body.quantity === "number" && isFinite(body.quantity)
      ? Math.max(0, Math.round(body.quantity))
      : 1;
  const image_url =
    typeof body.image_url === "string" && body.image_url.trim()
      ? body.image_url.trim()
      : null;

  const enrichment = await enrich(brand, perfume_name);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("shop_stock")
    .insert({
      shop_id: shopId,
      brand,
      perfume_name,
      price,
      quantity,
      image_url,
      is_private_sale: false,
      private_sale_price: null,
      sale_quantity: null,
      private_sale_enabled_at: null,
      family: enrichment.family,
      notes_top: enrichment.notes_top,
      notes_heart: enrichment.notes_heart,
      notes_base: enrichment.notes_base,
    })
    .select("*")
    .single();

  if (error) return jsonError(error.message, 500);
  return jsonOk({ item: data, enriched: enrichment.notes_top.length > 0 || enrichment.family !== null });
}

/* ─── PATCH: re-enrich a specific row (forces a Fragella refetch) ───────── */

export async function PATCH(req: NextRequest) {
  const shopId = await getOwnerShopId(req);
  if (!shopId) return jsonError("Unauthorized", 401);

  const body = (await req.json().catch(() => ({}))) as { id?: unknown };
  const id = typeof body.id === "string" ? body.id : null;
  if (!id) return jsonError("id required");

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("shop_stock")
    .select("id, shop_id, brand, perfume_name")
    .eq("id", id)
    .maybeSingle();

  if (!row || row.shop_id !== shopId) return jsonError("Not found", 404);

  const enrichment = await enrich(row.brand, row.perfume_name);
  const { data, error } = await admin
    .from("shop_stock")
    .update({
      family: enrichment.family,
      notes_top: enrichment.notes_top,
      notes_heart: enrichment.notes_heart,
      notes_base: enrichment.notes_base,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return jsonError(error.message, 500);
  return jsonOk({ item: data, enriched: enrichment.notes_top.length > 0 || enrichment.family !== null });
}

/* ─── DELETE: remove a stock row ────────────────────────────────────────── */

export async function DELETE(req: NextRequest) {
  const shopId = await getOwnerShopId(req);
  if (!shopId) return jsonError("Unauthorized", 401);

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return jsonError("id required");

  const admin = createAdminClient();
  const { error } = await admin
    .from("shop_stock")
    .delete()
    .eq("id", id)
    .eq("shop_id", shopId);

  if (error) return jsonError(error.message, 500);
  return jsonOk({ ok: true });
}
