/**
 * /api/boutique/clients — fiches clients gérées par les boutiques.
 *
 *   POST  /api/boutique/clients     — crée une fiche après une session
 *                                     "Pour un client".
 *   GET   /api/boutique/clients     — liste les fiches de la boutique
 *                                     connectée. ?search=... filtre par
 *                                     prénom + nom.
 *
 * Auth : Bearer access_token Supabase. Le route handler vérifie que le
 * user_id matche une ligne `public.shops` (convention CRM).
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

/* ─── POST : créer une fiche client ─────────────────────────────────────── */

type CreateBody = {
  firstName: string;
  lastName: string;
  quizAnswers: Record<string, unknown>;
  dna: unknown | null;
  matchedCards: unknown[];
  dislikedCards: unknown[];
  report: unknown | null;
  notes?: string | null;
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

  const firstName = (body.firstName ?? "").trim();
  const lastName = (body.lastName ?? "").trim();
  if (!firstName || !lastName) {
    return jsonError("missing_name", 400, "Prénom et nom requis.");
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("boutique_clients")
    .insert({
      shop_id: shopId,
      first_name: firstName,
      last_name: lastName,
      quiz_answers: body.quizAnswers ?? {},
      dna: body.dna ?? null,
      matched_cards: body.matchedCards ?? [],
      disliked_cards: body.dislikedCards ?? [],
      report: body.report ?? null,
      notes: body.notes ?? null,
    })
    .select("id, created_at")
    .single();

  if (error) return jsonError("db_error", 500, error.message);
  return jsonOk({ id: data.id, created_at: data.created_at }, 201);
}

/* ─── GET : lister / chercher les fiches ────────────────────────────────── */

export async function GET(req: NextRequest) {
  const shopId = await getOwnerShopId(req);
  if (!shopId) return jsonError("auth_required", 401);

  const url = new URL(req.url);
  const search = (url.searchParams.get("search") ?? "").trim();
  const limit = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get("limit") ?? 50)),
  );

  const admin = createAdminClient();
  let query = admin
    .from("boutique_clients")
    .select(
      "id, first_name, last_name, created_at, updated_at, dna, report, notes",
    )
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (search) {
    // ilike on the concatenated name handles "Sarah", "Du", "Sarah Du"…
    query = query.or(
      `first_name.ilike.%${search}%,last_name.ilike.%${search}%`,
    );
  }

  const { data, error } = await query;
  if (error) return jsonError("db_error", 500, error.message);
  return jsonOk({ clients: data ?? [] });
}
