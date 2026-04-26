/**
 * /api/referral — Referral & points system
 *
 * GET  /api/referral          → current user's code, points, rank, referrals
 * POST /api/referral  { action: "init" }                 → create code if needed
 * POST /api/referral  { action: "claim", code }          → record referral on signup
 * POST /api/referral  { action: "subscribe", tier }      → record subscription & grant points
 * GET  /api/referral?leaderboard=1&limit=N               → top-N leaderboard
 */

import { createAdminClient } from "@/lib/supabase-server";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

/* ─── Points constants ───────────────────────────────────────────────────── */

const PTS = {
  referral_signup:  100,  // referrer earns when referred signs up
  referral_curieux: 200,  // referrer earns bonus when referred subscribes Curieux
  referral_initie:  500,  // referrer earns bonus when referred subscribes Initié
  referral_mecene:  900,  // referrer earns bonus when referred subscribes Mécène
  self_curieux:      50,  // self earns on Curieux subscription
  self_initie:      150,  // self earns on Initié subscription
  self_mecene:      300,  // self earns on Mécène subscription
};

/** Map any tier name (legacy or current) to the canonical paid-tier slug used
 *  for points & analytics. Returns null for free / unknown so the route 400s. */
function canonicalTier(raw: unknown): "curieux" | "initie" | "mecene" | null {
  if (raw === "curieux" || raw === "initie" || raw === "mecene") return raw;
  // Legacy MVP-v1 names — still accepted so older clients don't crash.
  if (raw === "basic") return "curieux";
  if (raw === "premium") return "initie";
  return null;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function codeFromUserId(userId: string): string {
  return userId.replace(/-/g, "").slice(0, 8).toUpperCase();
}

function displayNameFromEmail(email: string): string {
  return email.split("@")[0].slice(0, 20);
}

function jsonOk(data: unknown, status = 200) {
  return Response.json(data, { status });
}

function jsonError(msg: string, status = 400) {
  return Response.json({ error: msg }, { status });
}

/** Verifies the Bearer token and returns the authenticated user, or null. */
async function getUser(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer /i, "");
  if (!token) return null;
  const admin = createAdminClient();
  const { data } = await admin.auth.getUser(token);
  return data.user ?? null;
}

/* ─── GET ────────────────────────────────────────────────────────────────── */

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const admin = createAdminClient();

  // Leaderboard (public)
  if (url.searchParams.get("leaderboard")) {
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 100);
    const { data, error } = await admin
      .from("leaderboard_view")
      .select("user_id, display_name, points, rank, referral_count")
      .order("points", { ascending: false })
      .limit(limit);
    if (error) return jsonError(error.message, 500);
    return jsonOk(data);
  }

  // Current user's referral data
  const user = await getUser(req);
  if (!user) return jsonError("Unauthorized", 401);

  // Get or auto-create referral code
  let { data: rc } = await admin
    .from("referral_codes")
    .select("code, display_name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!rc) {
    const code = codeFromUserId(user.id);
    const display_name = displayNameFromEmail(user.email ?? "inconnu");
    const { data: inserted } = await admin
      .from("referral_codes")
      .insert({ user_id: user.id, code, display_name })
      .select("code, display_name")
      .single();
    rc = inserted;
  }

  // Points
  const { data: pb } = await admin
    .from("points_balance")
    .select("points")
    .eq("user_id", user.id)
    .maybeSingle();

  // Rank
  const { data: rankRow } = await admin
    .from("leaderboard_view")
    .select("rank")
    .eq("user_id", user.id)
    .maybeSingle();

  // Referrals list
  const { data: referrals } = await admin
    .from("referrals")
    .select("referred_id, created_at, subscription_tier")
    .eq("referrer_id", user.id)
    .order("created_at", { ascending: false });

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://mobile-laniche.vercel.app";

  return jsonOk({
    code: rc?.code ?? null,
    link: rc?.code ? `${baseUrl}/rejoindre?ref=${rc.code}` : null,
    points: pb?.points ?? 0,
    rank: rankRow?.rank ?? null,
    referrals: referrals ?? [],
    pts_table: PTS,
  });
}

/* ─── POST ───────────────────────────────────────────────────────────────── */

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return jsonError("Unauthorized", 401);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = body.action as string | undefined;
  const admin = createAdminClient();

  /* init: ensure a referral code exists for this user */
  if (action === "init") {
    const { data: existing } = await admin
      .from("referral_codes")
      .select("code")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) return jsonOk({ code: existing.code });

    const code = codeFromUserId(user.id);
    const display_name = displayNameFromEmail(user.email ?? "inconnu");
    const { data, error } = await admin
      .from("referral_codes")
      .insert({ user_id: user.id, code, display_name })
      .select("code")
      .single();

    if (error) return jsonError(error.message, 500);
    return jsonOk({ code: data.code });
  }

  /* claim: new user signs up via a referral link */
  if (action === "claim") {
    const code = (body.code as string | undefined)?.trim().toUpperCase();
    if (!code) return jsonError("code required");

    // Find the referrer
    const { data: rc } = await admin
      .from("referral_codes")
      .select("user_id")
      .eq("code", code)
      .maybeSingle();

    if (!rc) return jsonError("Invalid referral code", 404);
    if (rc.user_id === user.id) return jsonError("Cannot refer yourself");

    // Ensure this user hasn't already been referred
    const { data: existing } = await admin
      .from("referrals")
      .select("id")
      .eq("referred_id", user.id)
      .maybeSingle();

    if (existing) return jsonOk({ already_referred: true });

    // Insert referral
    const { error: refErr } = await admin.from("referrals").insert({
      referrer_id: rc.user_id,
      referred_id: user.id,
      code,
    });
    if (refErr) return jsonError(refErr.message, 500);

    // Add points to referrer
    await addPoints(admin, rc.user_id, PTS.referral_signup, "referral_signup", {
      referred_id: user.id,
    });

    // Ensure the new user also gets a referral code
    const newCode = codeFromUserId(user.id);
    const newName = displayNameFromEmail(user.email ?? "inconnu");
    await admin.from("referral_codes").upsert(
      { user_id: user.id, code: newCode, display_name: newName },
      { onConflict: "user_id", ignoreDuplicates: true },
    );

    return jsonOk({ ok: true, points_granted: PTS.referral_signup });
  }

  /* subscribe: user upgrades their plan — grant self-points + notify referrer */
  if (action === "subscribe") {
    const tier = canonicalTier(body.tier);
    if (!tier) return jsonError("invalid tier");

    const selfPts =
      tier === "mecene" ? PTS.self_mecene
      : tier === "initie" ? PTS.self_initie
      : PTS.self_curieux;
    const refPts =
      tier === "mecene" ? PTS.referral_mecene
      : tier === "initie" ? PTS.referral_initie
      : PTS.referral_curieux;
    const reason = `referral_${tier}`;

    // Self-points
    await addPoints(admin, user.id, selfPts, `self_${tier}`, { tier });

    // Check if this user was referred
    const { data: referral } = await admin
      .from("referrals")
      .select("id, referrer_id, subscription_tier")
      .eq("referred_id", user.id)
      .maybeSingle();

    if (referral && !referral.subscription_tier) {
      // Grant bonus to referrer
      await addPoints(admin, referral.referrer_id, refPts, reason, {
        referred_id: user.id,
        tier,
      });
      // Update referral record
      await admin
        .from("referrals")
        .update({ subscription_tier: tier, subscribed_at: new Date().toISOString() })
        .eq("id", referral.id);
    }

    return jsonOk({ ok: true, self_points: selfPts });
  }

  return jsonError("Unknown action");
}

/* ─── Internal: add points ───────────────────────────────────────────────── */

async function addPoints(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  userId: string,
  amount: number,
  reason: string,
  meta: Record<string, unknown> = {},
) {
  // Upsert balance
  const { data: existing } = await admin
    .from("points_balance")
    .select("points")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    await admin
      .from("points_balance")
      .update({ points: existing.points + amount, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
  } else {
    await admin
      .from("points_balance")
      .insert({ user_id: userId, points: amount });
  }

  // Log
  await admin.from("points_log").insert({ user_id: userId, amount, reason, meta });
}
