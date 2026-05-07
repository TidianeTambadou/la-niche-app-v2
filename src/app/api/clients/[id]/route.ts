/**
 * /api/clients/[id]
 *
 *   GET    — full fiche read (boutique only).
 *   PATCH  — boutique edits notes / contact / preferred channel /
 *            consent. The questionnaire answers and AI report are
 *            never patched here — re-running the analysis is a separate
 *            endpoint (TODO when needed).
 *   DELETE — boutique deletes the fiche.
 */

import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { getOwnerShopId, jsonError, jsonOk } from "@/lib/auth-server";
import type { CommChannel } from "@/lib/types";

export const runtime = "nodejs";

const CHANNELS: CommChannel[] = ["email", "sms", "both"];

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const shopId = await getOwnerShopId(req);
  if (!shopId) return jsonError("auth_required", 401);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("clients_v2")
    .select("*")
    .eq("id", id)
    .eq("shop_id", shopId)
    .maybeSingle();

  if (error) return jsonError("db_error", 500, error.message);
  if (!data) return jsonError("not_found", 404);
  return jsonOk({ client: data });
}

type PatchBody = {
  email?: string | null;
  phone?: string | null;
  addressLine?: string | null;
  postalCode?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  preferredChannel?: CommChannel;
  consentMarketing?: boolean;
  notes?: string | null;
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
  if (body.email !== undefined) update.email = body.email?.trim() || null;
  if (body.phone !== undefined) update.phone = body.phone?.trim() || null;
  if (body.addressLine !== undefined) update.address_line = body.addressLine?.trim() || null;
  if (body.postalCode !== undefined) update.postal_code = body.postalCode?.trim() || null;
  if (body.city !== undefined) update.city = body.city?.trim() || null;
  if (body.latitude !== undefined) update.latitude = body.latitude;
  if (body.longitude !== undefined) update.longitude = body.longitude;
  if (body.preferredChannel !== undefined) {
    if (!CHANNELS.includes(body.preferredChannel)) return jsonError("invalid_channel", 400);
    update.preferred_channel = body.preferredChannel;
  }
  if (typeof body.consentMarketing === "boolean") {
    update.consent_marketing = body.consentMarketing;
    update.consent_at = body.consentMarketing ? new Date().toISOString() : null;
  }
  if (body.notes !== undefined) update.notes = body.notes;

  if (Object.keys(update).length === 0) return jsonError("nothing_to_update", 400);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("clients_v2")
    .update(update)
    .eq("id", id)
    .eq("shop_id", shopId)
    .select("*")
    .maybeSingle();

  if (error) return jsonError("db_error", 500, error.message);
  if (!data) return jsonError("not_found", 404);
  return jsonOk({ client: data });
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
    .from("clients_v2")
    .delete()
    .eq("id", id)
    .eq("shop_id", shopId);

  if (error) return jsonError("db_error", 500, error.message);
  return jsonOk({ ok: true });
}
