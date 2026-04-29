/**
 * /api/boutique/clients/[id] — fiche client unique.
 *
 *   GET    : récupère la fiche complète (auth: shop owner).
 *   PATCH  : met à jour les notes libres (auth: shop owner).
 *   DELETE : supprime la fiche.
 */

import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

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

function jsonOk(data: unknown, status = 200) {
  return Response.json(data, { status });
}
function jsonError(error: string, status = 400, detail?: string) {
  return Response.json(
    { error, ...(detail ? { detail } : {}) },
    { status },
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const shopId = await getOwnerShopId(req);
  if (!shopId) return jsonError("auth_required", 401);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("boutique_clients")
    .select("*")
    .eq("id", id)
    .eq("shop_id", shopId)
    .maybeSingle();
  if (error) return jsonError("db_error", 500, error.message);
  if (!data) return jsonError("not_found", 404);
  return jsonOk({ client: data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const shopId = await getOwnerShopId(req);
  if (!shopId) return jsonError("auth_required", 401);

  let body: { notes?: string | null };
  try {
    body = (await req.json()) as { notes?: string | null };
  } catch {
    return jsonError("invalid_json", 400);
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("boutique_clients")
    .update({ notes: body.notes ?? null })
    .eq("id", id)
    .eq("shop_id", shopId)
    .select("id, notes, updated_at")
    .maybeSingle();
  if (error) return jsonError("db_error", 500, error.message);
  if (!data) return jsonError("not_found", 404);
  return jsonOk({ client: data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const shopId = await getOwnerShopId(req);
  if (!shopId) return jsonError("auth_required", 401);

  const admin = createAdminClient();
  const { error } = await admin
    .from("boutique_clients")
    .delete()
    .eq("id", id)
    .eq("shop_id", shopId);
  if (error) return jsonError("db_error", 500, error.message);
  return jsonOk({ ok: true });
}
