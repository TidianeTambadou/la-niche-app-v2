/**
 * /api/clients
 *
 *   GET   — boutique reads its own client roster. Supports filtering by
 *           date (?from=YYYY-MM-DD&to=YYYY-MM-DD), source (?source=in_shop |
 *           user_account), preferred_channel (?channel=email|sms|both),
 *           and free-text search (?search=).
 *
 *   POST  — creates a fresh fiche client. Two callers :
 *             1) The boutique itself (in store, source = 'in_shop')
 *             2) An end user filling the form from their account
 *                (source = 'user_account', shop_id picked from body)
 *           In both cases the server :
 *             - validates inputs (name, contact, channel)
 *             - fetches the shop's questions to label the answers
 *             - calls the LLM to generate the olfactive profile + report
 *             - persists everything in `clients_v2`
 */

import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { getUserId, getOwnerShopId, jsonError, jsonOk } from "@/lib/auth-server";
import { buildOlfactiveReport } from "@/lib/olfactive-report";
import type { CommChannel } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const CHANNELS: CommChannel[] = ["email", "sms", "both"];

/* ─── GET : list / filter clients (boutique scope) ────────────────── */

export async function GET(req: NextRequest) {
  const shopId = await getOwnerShopId(req);
  if (!shopId) return jsonError("auth_required", 401);

  const url = new URL(req.url);
  const search = (url.searchParams.get("search") ?? "").trim();
  const source = url.searchParams.get("source");
  const channel = url.searchParams.get("channel");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? 200)));

  const admin = createAdminClient();
  let query = admin
    .from("clients_v2")
    .select(
      "id, source, first_name, last_name, email, phone, address_line, postal_code, city, " +
      "preferred_channel, consent_marketing, olfactive_profile, report, notes, created_at, updated_at",
    )
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (source === "in_shop" || source === "user_account") query = query.eq("source", source);
  if (channel && CHANNELS.includes(channel as CommChannel)) {
    query = query.eq("preferred_channel", channel);
  }
  if (from) query = query.gte("created_at", from);
  if (to) {
    // include the whole `to` day
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    query = query.lte("created_at", end.toISOString());
  }
  if (search) {
    query = query.or(
      `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`,
    );
  }

  const { data, error } = await query;
  if (error) return jsonError("db_error", 500, error.message);
  return jsonOk({ clients: data ?? [] });
}

/* ─── POST : create a fiche client ──────────────────────────────── */

type CreateBody = {
  /** Required when the caller is a regular user (not the boutique itself). */
  shopId?: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  /** Captured via the BAN autocomplete (api-adresse.data.gouv.fr). */
  addressLine?: string | null;
  postalCode?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  preferredChannel: CommChannel;
  consentMarketing: boolean;
  /** key = question.id, value = string | string[] | number. */
  answers: Record<string, unknown>;
};

export async function POST(req: NextRequest) {
  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return jsonError("invalid_json", 400);
  }

  const userId = await getUserId(req);
  if (!userId) return jsonError("auth_required", 401);

  const ownerShopId = await getOwnerShopId(req);
  // `source = in_shop` when the caller IS the shop. Else they're a user
  // creating their own card on a chosen boutique, source = user_account.
  let shopId: string;
  let source: "in_shop" | "user_account";
  let userIdForRow: string | null;

  if (ownerShopId) {
    shopId = ownerShopId;
    source = "in_shop";
    userIdForRow = null;
  } else {
    if (!body.shopId) return jsonError("missing_shop_id", 400);
    shopId = body.shopId;
    source = "user_account";
    userIdForRow = userId;
  }

  const firstName = (body.firstName ?? "").trim();
  const lastName = (body.lastName ?? "").trim();
  const email = body.email?.trim() || null;
  const phone = body.phone?.trim() || null;

  if (!firstName || !lastName) return jsonError("missing_name", 400);
  if (!email && !phone) return jsonError("missing_contact", 400);
  if (!CHANNELS.includes(body.preferredChannel)) return jsonError("invalid_channel", 400);
  if ((body.preferredChannel === "email" || body.preferredChannel === "both") && !email) {
    return jsonError("email_required_for_channel", 400);
  }
  if ((body.preferredChannel === "sms" || body.preferredChannel === "both") && !phone) {
    return jsonError("phone_required_for_channel", 400);
  }

  const admin = createAdminClient();

  // Pull the shop's questions to label the answers when generating the report.
  const { data: questions, error: qErr } = await admin
    .from("shop_questions")
    .select("id, label, kind")
    .eq("shop_id", shopId)
    .order("position", { ascending: true });
  if (qErr) return jsonError("db_error", 500, qErr.message);

  let olfactiveProfile: unknown = null;
  let report: unknown = null;
  try {
    const generated = await buildOlfactiveReport(
      (questions ?? []) as { id: string; label: string; kind: string }[],
      body.answers ?? {},
      { firstName, lastName },
    );
    olfactiveProfile = generated.profile;
    report = generated.report;
  } catch (err) {
    // We don't fail the whole POST when the LLM hiccups — the boutique can
    // still re-run the analysis later from the detail page. Persist null
    // and return a soft warning.
    console.warn("[clients.POST] LLM failed:", err instanceof Error ? err.message : err);
  }

  const { data, error } = await admin
    .from("clients_v2")
    .insert({
      shop_id: shopId,
      user_id: userIdForRow,
      source,
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
      address_line: body.addressLine?.trim() || null,
      postal_code: body.postalCode?.trim() || null,
      city: body.city?.trim() || null,
      latitude: typeof body.latitude === "number" ? body.latitude : null,
      longitude: typeof body.longitude === "number" ? body.longitude : null,
      preferred_channel: body.preferredChannel,
      consent_marketing: !!body.consentMarketing,
      consent_at: body.consentMarketing ? new Date().toISOString() : null,
      quiz_answers: body.answers ?? {},
      olfactive_profile: olfactiveProfile,
      report,
    })
    .select("id, created_at")
    .single();

  if (error) return jsonError("db_error", 500, error.message);
  return jsonOk(
    {
      id: data.id,
      created_at: data.created_at,
      olfactive_profile: olfactiveProfile,
      report,
    },
    201,
  );
}
