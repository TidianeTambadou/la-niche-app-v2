/**
 * Quota module — server-side enforcement for the metered modes of the agent.
 *
 * Source of truth lives in Supabase:
 *   public.user_subscription   — tier + cycle + PayPal refs
 *   public.user_usage          — per-user × month counters
 *   public.increment_user_usage() — atomic bump RPC
 *
 * The client-side localStorage in src/lib/store.tsx becomes a CACHE for the
 * /api/usage GET response. Anything that costs money (recommend, identify
 * with full agent loop, ask) MUST go through this module.
 *
 * Usage pattern in an API route:
 *
 *   const userId = await requireUserId(req);
 *   if (!userId) return jsonError("auth_required", 401);
 *   const gate = await checkQuota(userId, "recos");
 *   if (!gate.allowed) return jsonError("quota_exceeded", 402);
 *   // … do the work …
 *   await consumeQuota(userId, "recos");
 *   // include the new remaining count in the response so the client UI
 *   // updates without a follow-up GET.
 */

import { createAdminClient } from "@/lib/supabase-server";

/** Counter buckets tracked per user × month. */
export type QuotaKind = "recos" | "balades" | "scans" | "asks" | "searches";

/** Subscription tier (must match SubscriptionTier in src/lib/store.tsx). */
export type Tier = "free" | "curieux" | "initie" | "mecene" | "admin";

/* ─── Limits — source of truth, mirrored from the client store ─────────── */

/** Per-tier monthly caps. Infinity = no cap (UI shows "Illimité").
 *  - searches : Fragella autocomplete + Tavily fallback (token-cost real)
 *  - recos    : pipeline 4 étapes (cher : ~$0.08-0.13/appel)
 *  - balades  : balade guidée (route generation, ~$0.05/appel)
 *  - scans    : caméra → vision Claude + Fragrantica scrape
 *  - asks     : concierge IA chat
 *  Free = vitrine stricte : aucune balade, recherche très limitée.
 *  Admin = tout illimité, jamais facturé — réservé à l'équipe La Niche. */
const TIER_QUOTA: Record<Tier, Record<QuotaKind, number>> = {
  free:    { recos: 2,        balades: 0,        scans: 1,        asks: 0,        searches: 10       },
  curieux: { recos: 25,       balades: 10,       scans: 20,       asks: 30,       searches: 200      },
  initie:  { recos: 60,       balades: 25,       scans: Infinity, asks: Infinity, searches: Infinity },
  mecene:  { recos: 200,      balades: 50,       scans: Infinity, asks: Infinity, searches: Infinity },
  admin:   { recos: Infinity, balades: Infinity, scans: Infinity, asks: Infinity, searches: Infinity },
};

/* ─── Auth helper ──────────────────────────────────────────────────────── */

/** Reads the Bearer token, validates it via Supabase, returns the user id
 *  or null. Anonymous → null (caller decides 401 or fallback). Accepts a
 *  plain Request (the /api/agent handler uses Request, not NextRequest). */
export async function requireUserId(req: Request): Promise<string | null> {
  const token = req.headers.get("authorization")?.replace(/^Bearer /i, "");
  if (!token) return null;
  const admin = createAdminClient();
  const { data } = await admin.auth.getUser(token);
  return data.user?.id ?? null;
}

/* ─── Subscription lookup ──────────────────────────────────────────────── */

export type SubscriptionRow = {
  tier: Tier;
  status: "active" | "paused" | "cancelled" | "past_due";
  current_period_end: string | null;
};

/** Returns the user's effective subscription. Missing row OR cancelled /
 *  past_due → free. Treats expired periods (current_period_end < now) as
 *  free too, so a stale row doesn't grant access after PayPal lapses. */
export async function getSubscription(userId: string): Promise<SubscriptionRow> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("user_subscription")
    .select("tier, status, current_period_end")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return { tier: "free", status: "active", current_period_end: null };

  const status = data.status as SubscriptionRow["status"];
  if (status === "cancelled" || status === "past_due" || status === "paused") {
    return { tier: "free", status, current_period_end: data.current_period_end };
  }

  // Defense in depth: if the period ended and the webhook hasn't fired yet,
  // act as free. The row stays so we know what they HAD.
  if (
    data.current_period_end &&
    new Date(data.current_period_end).getTime() < Date.now()
  ) {
    return { tier: "free", status: "active", current_period_end: data.current_period_end };
  }

  return {
    tier: data.tier as Tier,
    status,
    current_period_end: data.current_period_end,
  };
}

/* ─── Quota check + consume ────────────────────────────────────────────── */

export type QuotaCheck = {
  allowed: boolean;
  remaining: number; // Infinity for unlimited
  limit: number;
  used: number;
  tier: Tier;
};

/** Reads the current month's usage row and computes whether the user can
 *  spend one more unit of `kind`. Does NOT consume — call consumeQuota
 *  after the work succeeds. */
export async function checkQuota(
  userId: string,
  kind: QuotaKind,
): Promise<QuotaCheck> {
  const sub = await getSubscription(userId);
  const limit = TIER_QUOTA[sub.tier][kind];
  if (limit === Infinity) {
    return {
      allowed: true,
      remaining: Infinity,
      limit: Infinity,
      used: 0,
      tier: sub.tier,
    };
  }

  const period = currentPeriodStart();
  const admin = createAdminClient();
  // Select all 5 columns and pick `kind` after — Supabase's typed select
  // narrows to a per-column union that doesn't allow dynamic indexing.
  const { data } = await admin
    .from("user_usage")
    .select("recos, balades, scans, asks, searches")
    .eq("user_id", userId)
    .eq("period_start", period)
    .maybeSingle();
  const used = (data?.[kind] as number | undefined) ?? 0;
  return {
    allowed: used < limit,
    remaining: Math.max(0, limit - used),
    limit,
    used,
    tier: sub.tier,
  };
}

/** Atomically increments the counter and returns the new used value. Use
 *  this AFTER the metered work has succeeded. */
export async function consumeQuota(
  userId: string,
  kind: QuotaKind,
  delta = 1,
): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("increment_user_usage", {
    p_user_id: userId,
    p_kind: kind,
    p_delta: delta,
  });
  if (error) throw new Error(`consumeQuota: ${error.message}`);
  return (data as number) ?? 0;
}

/** Refunds N units — used when the metered work failed AFTER consumption,
 *  or to undo a speculative consume on race-condition rejects. */
export async function refundQuota(
  userId: string,
  kind: QuotaKind,
  delta = 1,
): Promise<void> {
  if (delta <= 0) return;
  await consumeQuota(userId, kind, -delta);
}

/* ─── Usage summary (for /api/usage) ───────────────────────────────────── */

export type UsageSummary = {
  tier: Tier;
  status: SubscriptionRow["status"];
  billing_cycle: "monthly" | "annual";
  current_period_end: string | null;
  usage: Record<
    QuotaKind,
    {
      used: number;
      /** Infinity serialises to null over JSON — caller should treat null as unlimited. */
      limit: number | null;
    }
  >;
};

export async function getUsageSummary(userId: string): Promise<UsageSummary> {
  const admin = createAdminClient();
  const [subRes, usageRes] = await Promise.all([
    admin
      .from("user_subscription")
      .select("tier, status, billing_cycle, current_period_end")
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("user_usage")
      .select("recos, balades, scans, asks, searches")
      .eq("user_id", userId)
      .eq("period_start", currentPeriodStart())
      .maybeSingle(),
  ]);

  // Mirror the safety net in getSubscription() — cancelled / expired => free.
  const sub = await getSubscription(userId);
  const tier = sub.tier;
  const limits = TIER_QUOTA[tier];
  const usage = usageRes.data ?? { recos: 0, balades: 0, scans: 0, asks: 0, searches: 0 };

  const serialise = (n: number) => (n === Infinity ? null : n);
  return {
    tier,
    status: subRes.data?.status ?? "active",
    billing_cycle:
      (subRes.data?.billing_cycle as "monthly" | "annual" | undefined) ??
      "monthly",
    current_period_end: subRes.data?.current_period_end ?? null,
    usage: {
      recos:    { used: usage.recos,    limit: serialise(limits.recos) },
      balades:  { used: usage.balades,  limit: serialise(limits.balades) },
      scans:    { used: usage.scans,    limit: serialise(limits.scans) },
      asks:     { used: usage.asks,     limit: serialise(limits.asks) },
      searches: { used: usage.searches, limit: serialise(limits.searches) },
    },
  };
}

/* ─── Period helper ────────────────────────────────────────────────────── */

/** First day of the current month UTC, ISO date string `YYYY-MM-01`. */
function currentPeriodStart(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = (now.getUTCMonth() + 1).toString().padStart(2, "0");
  return `${y}-${m}-01`;
}
