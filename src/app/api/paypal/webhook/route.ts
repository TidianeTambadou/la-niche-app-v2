/**
 * /api/paypal/webhook — receives subscription lifecycle events from PayPal.
 *
 * Configure in PayPal Developer dashboard with this URL and these events:
 *   • BILLING.SUBSCRIPTION.ACTIVATED        — user finished checkout
 *   • BILLING.SUBSCRIPTION.CANCELLED        — user (or we) cancelled
 *   • BILLING.SUBSCRIPTION.SUSPENDED        — paused (rare)
 *   • BILLING.SUBSCRIPTION.PAYMENT.FAILED   — billing retry exhausted
 *   • PAYMENT.SALE.COMPLETED                — recurring renewal succeeded
 *
 * Auth: PayPal signs the request; we verify via /v1/notifications/verify-webhook-signature.
 * No Bearer token from the client — the user_id comes from the subscription's
 * `custom_id` field, set when we created the subscription on the checkout page.
 */

import { createAdminClient } from "@/lib/supabase-server";
import {
  verifyPayPalWebhook,
  planIdToTierCycle,
  getPayPalSubscription,
  type PayPalWebhookEvent,
} from "@/lib/paypal";

export const runtime = "nodejs";

type WebhookHandlerResult =
  | { ok: true }
  | { ok: false; error: string; status?: number };

export async function POST(req: Request) {
  // Read body once as text — verifyPayPalWebhook needs the raw form so the
  // signature check works against the bytes PayPal actually signed.
  const rawBody = await req.text();

  const verified = await verifyPayPalWebhook(req.headers, rawBody);
  if (!verified) {
    return Response.json({ error: "signature_invalid" }, { status: 401 });
  }

  let event: PayPalWebhookEvent;
  try {
    event = JSON.parse(rawBody) as PayPalWebhookEvent;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    const result = await dispatch(event);
    if (!result.ok) {
      return Response.json(
        { error: result.error },
        { status: result.status ?? 400 },
      );
    }
    return Response.json({ ok: true });
  } catch (e) {
    console.error("[paypal-webhook] handler threw:", e);
    return Response.json(
      { error: "internal_error", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

/* ─── Event dispatch ────────────────────────────────────────────────── */

async function dispatch(event: PayPalWebhookEvent): Promise<WebhookHandlerResult> {
  switch (event.event_type) {
    case "BILLING.SUBSCRIPTION.ACTIVATED":
      return handleActivated(event);
    case "BILLING.SUBSCRIPTION.CANCELLED":
      return handleStatusChange(event, "cancelled");
    case "BILLING.SUBSCRIPTION.SUSPENDED":
      return handleStatusChange(event, "paused");
    case "BILLING.SUBSCRIPTION.PAYMENT.FAILED":
      return handleStatusChange(event, "past_due");
    case "PAYMENT.SALE.COMPLETED":
      return handleRenewal(event);
    default:
      // Unknown / non-actionable event → ack with 200 so PayPal doesn't retry.
      console.log(`[paypal-webhook] ignoring event_type=${event.event_type}`);
      return { ok: true };
  }
}

/* ─── Helpers ──────────────────────────────────────────────────────── */

type SubscriptionResource = {
  id?: string;
  plan_id?: string;
  custom_id?: string;
  billing_info?: { next_billing_time?: string };
};

async function handleActivated(
  event: PayPalWebhookEvent,
): Promise<WebhookHandlerResult> {
  const resource = event.resource as SubscriptionResource;
  const subscriptionId = resource.id;
  const planId = resource.plan_id;
  if (!subscriptionId || !planId) {
    return { ok: false, error: "missing_subscription_or_plan", status: 400 };
  }

  // The webhook payload sometimes lacks custom_id and next_billing_time;
  // refetch the subscription to be sure.
  const fresh = await getPayPalSubscription(subscriptionId);
  const userId = fresh?.custom_id ?? resource.custom_id;
  if (!userId) {
    return {
      ok: false,
      error: "missing_custom_id",
      status: 400,
    };
  }

  const mapping = planIdToTierCycle(planId);
  if (!mapping) {
    console.warn(`[paypal-webhook] unknown plan_id=${planId}`);
    return { ok: false, error: "unknown_plan", status: 400 };
  }

  const periodEnd =
    fresh?.billing_info?.next_billing_time ??
    resource.billing_info?.next_billing_time ??
    null;

  const admin = createAdminClient();
  const { error } = await admin
    .from("user_subscription")
    .upsert(
      {
        user_id: userId,
        tier: mapping.tier,
        billing_cycle: mapping.cycle,
        status: "active",
        current_period_end: periodEnd,
        paypal_subscription_id: subscriptionId,
        paypal_plan_id: planId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  if (error) {
    console.error("[paypal-webhook] upsert failed:", error);
    return { ok: false, error: "db_error", status: 500 };
  }

  return { ok: true };
}

async function handleStatusChange(
  event: PayPalWebhookEvent,
  status: "cancelled" | "paused" | "past_due",
): Promise<WebhookHandlerResult> {
  const resource = event.resource as SubscriptionResource;
  const subscriptionId = resource.id;
  if (!subscriptionId) {
    return { ok: false, error: "missing_subscription", status: 400 };
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("user_subscription")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("paypal_subscription_id", subscriptionId);
  if (error) {
    console.error("[paypal-webhook] status update failed:", error);
    return { ok: false, error: "db_error", status: 500 };
  }
  return { ok: true };
}

/** Recurring renewal — bump `current_period_end` to the new next-billing
 *  time so the quota gate doesn't accidentally treat the period as expired. */
async function handleRenewal(
  event: PayPalWebhookEvent,
): Promise<WebhookHandlerResult> {
  // PAYMENT.SALE.COMPLETED's resource is a sale, not the subscription. The
  // billing_agreement_id field links back to the subscription id (legacy
  // naming). For PayPal Subscriptions, the subscription id sits at
  // `resource.billing_agreement_id`.
  const resource = event.resource as { billing_agreement_id?: string };
  const subscriptionId = resource.billing_agreement_id;
  if (!subscriptionId) {
    // Some sales don't link to a subscription (one-off captures) — ignore.
    return { ok: true };
  }
  const fresh = await getPayPalSubscription(subscriptionId);
  if (!fresh) return { ok: true };

  const periodEnd = fresh.billing_info?.next_billing_time ?? null;
  const admin = createAdminClient();
  await admin
    .from("user_subscription")
    .update({
      status: "active",
      current_period_end: periodEnd,
      updated_at: new Date().toISOString(),
    })
    .eq("paypal_subscription_id", subscriptionId);
  return { ok: true };
}
