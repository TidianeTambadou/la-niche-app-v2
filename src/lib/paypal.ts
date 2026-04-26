/**
 * PayPal Subscriptions — server-side helpers.
 *
 * Two responsibilities :
 *   1. Maintain a valid REST OAuth token (cached in module memory) so the
 *      webhook handler doesn't re-auth on every event.
 *   2. Map PayPal plan IDs back to the (tier, cycle) pair our app uses,
 *      driven by NEXT_PUBLIC_PAYPAL_PLAN_* env vars (set by the bootstrap
 *      script in scripts/paypal-bootstrap.mjs).
 *
 * Server-only — never import from a Client Component.
 */

import type { BillingCycle, SubscriptionTier } from "@/lib/store";

const API_BASE =
  process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com";

/* ─── OAuth ────────────────────────────────────────────────────────────── */

let cachedToken: { value: string; expiresAt: number } | null = null;

/** Fetches an access token, cached for `expires_in` minus 60s buffer. */
export async function getPayPalAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.value;
  }
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error("PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET not set");
  }
  const credentials = Buffer.from(`${id}:${secret}`).toString("base64");
  const res = await fetch(`${API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`PayPal OAuth ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return data.access_token;
}

/* ─── Plan-id ↔ (tier, cycle) mapping ─────────────────────────────────── */

/** Reverse lookup of a PayPal plan id to our internal (tier, cycle). Built
 *  from env vars at module load — if a mapping changes, redeploy. */
function buildPlanMap(): Map<string, { tier: SubscriptionTier; cycle: BillingCycle }> {
  const m = new Map<string, { tier: SubscriptionTier; cycle: BillingCycle }>();
  const entries: Array<[string | undefined, SubscriptionTier, BillingCycle]> = [
    [process.env.NEXT_PUBLIC_PAYPAL_PLAN_CURIEUX_MONTHLY, "curieux", "monthly"],
    [process.env.NEXT_PUBLIC_PAYPAL_PLAN_CURIEUX_ANNUAL,  "curieux", "annual"],
    [process.env.NEXT_PUBLIC_PAYPAL_PLAN_INITIE_MONTHLY,  "initie",  "monthly"],
    [process.env.NEXT_PUBLIC_PAYPAL_PLAN_INITIE_ANNUAL,   "initie",  "annual"],
    [process.env.NEXT_PUBLIC_PAYPAL_PLAN_MECENE_MONTHLY,  "mecene",  "monthly"],
    [process.env.NEXT_PUBLIC_PAYPAL_PLAN_MECENE_ANNUAL,   "mecene",  "annual"],
  ];
  for (const [planId, tier, cycle] of entries) {
    if (planId) m.set(planId, { tier, cycle });
  }
  return m;
}

const PLAN_MAP = buildPlanMap();

export function planIdToTierCycle(
  planId: string,
): { tier: SubscriptionTier; cycle: BillingCycle } | null {
  return PLAN_MAP.get(planId) ?? null;
}

/** Inverse helper — used by `/api/paypal/create-subscription` to translate
 *  the (tier, cycle) the user picked into the actual PayPal plan id. */
export function tierCycleToPlanId(
  tier: SubscriptionTier,
  cycle: BillingCycle,
): string | null {
  for (const [planId, mapping] of PLAN_MAP) {
    if (mapping.tier === tier && mapping.cycle === cycle) return planId;
  }
  return null;
}

/* ─── Webhook signature verification ──────────────────────────────────── */

export type PayPalWebhookEvent = {
  id: string;
  event_type: string;
  resource_type: string;
  resource: Record<string, unknown>;
  create_time?: string;
};

/** Verifies a PayPal webhook signature using PayPal's verify endpoint.
 *  Returns true only on `verification_status: SUCCESS`. */
export async function verifyPayPalWebhook(
  headers: Headers,
  rawBody: string,
): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    console.warn("[paypal-webhook] PAYPAL_WEBHOOK_ID not set — refusing event");
    return false;
  }

  const required = [
    "paypal-transmission-id",
    "paypal-transmission-time",
    "paypal-cert-url",
    "paypal-auth-algo",
    "paypal-transmission-sig",
  ] as const;
  const headerVals: Record<string, string> = {};
  for (const h of required) {
    const v = headers.get(h);
    if (!v) {
      console.warn(`[paypal-webhook] missing header: ${h}`);
      return false;
    }
    headerVals[h] = v;
  }

  const token = await getPayPalAccessToken();
  const res = await fetch(
    `${API_BASE}/v1/notifications/verify-webhook-signature`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        webhook_id: webhookId,
        transmission_id: headerVals["paypal-transmission-id"],
        transmission_time: headerVals["paypal-transmission-time"],
        cert_url: headerVals["paypal-cert-url"],
        auth_algo: headerVals["paypal-auth-algo"],
        transmission_sig: headerVals["paypal-transmission-sig"],
        // The webhook_event MUST be the parsed JSON of the raw body — PayPal
        // re-serialises and compares.
        webhook_event: JSON.parse(rawBody),
      }),
    },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.warn(`[paypal-webhook] verify ${res.status}: ${detail.slice(0, 300)}`);
    return false;
  }
  const data = (await res.json()) as { verification_status?: string };
  return data.verification_status === "SUCCESS";
}

/* ─── Subscription details (fetch on activation) ─────────────────────── */

export type PayPalSubscriptionResource = {
  id: string;
  plan_id: string;
  status: string;
  custom_id?: string;
  billing_info?: {
    next_billing_time?: string;
  };
  start_time?: string;
};

/** Fetches a subscription by id — used by the webhook to pick up
 *  authoritative `next_billing_time` and `custom_id` (our user id). */
export async function getPayPalSubscription(
  subscriptionId: string,
): Promise<PayPalSubscriptionResource | null> {
  const token = await getPayPalAccessToken();
  const res = await fetch(
    `${API_BASE}/v1/billing/subscriptions/${subscriptionId}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!res.ok) {
    console.warn(
      `[paypal] get subscription ${subscriptionId} → ${res.status}`,
    );
    return null;
  }
  return (await res.json()) as PayPalSubscriptionResource;
}

/** Cancels a subscription (used when the user clicks "Annuler"). */
export async function cancelPayPalSubscription(
  subscriptionId: string,
  reason: string,
): Promise<boolean> {
  const token = await getPayPalAccessToken();
  const res = await fetch(
    `${API_BASE}/v1/billing/subscriptions/${subscriptionId}/cancel`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reason }),
    },
  );
  // 204 = OK, 422 if already cancelled (treat as success).
  return res.ok || res.status === 422;
}
