/**
 * /api/newsletter/send
 *
 *   POST { perfumeId, recipients, subject, body }
 *     - recipients = output of /api/newsletter/preview's `audience`
 *     - body uses `{{firstName}}` placeholder for personalisation
 *
 *   Email-only depuis Gallery La Niche v2.1 — le SMS via Twilio a été retiré.
 *
 *   Persists a campaign + recipients rows, then fans out via Resend.
 *   Each per-recipient send updates the row's status independently.
 *
 * Returns the campaign id and an aggregate count. Failures are recorded
 * inline in `newsletter_recipients.status` ; the campaign is marked
 * `sent` even if some individual rows failed (the boutique can read the
 * detail in the campaign row).
 */

import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { getOwnerShopId, jsonError, jsonOk } from "@/lib/auth-server";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";
export const maxDuration = 300;

type Recipient = {
  client_id: string;
  first_name: string;
  score: number;
  reason: string;
};

type Body = {
  /** Null pour les campagnes "message libre" — pas de parfum ciblé. */
  perfumeId: string | null;
  recipients: Recipient[];
  subject: string;
  body: string;
};

export async function POST(req: NextRequest) {
  const shopId = await getOwnerShopId(req);
  if (!shopId) return jsonError("auth_required", 401);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return jsonError("invalid_json", 400);
  }

  if (!Array.isArray(body.recipients) || body.recipients.length === 0) {
    return jsonError("invalid_payload", 400);
  }

  const admin = createAdminClient();

  // Re-fetch perfume + each recipient's contact info from the source of
  // truth ; we never trust client-supplied email/phone for actual sending.
  // Le perfume est facultatif (mode "message libre").
  if (body.perfumeId) {
    const { data: perfume, error: pErr } = await admin
      .from("shop_perfumes")
      .select("id, name, brand")
      .eq("id", body.perfumeId)
      .eq("shop_id", shopId)
      .maybeSingle();
    if (pErr) return jsonError("db_error", 500, pErr.message);
    if (!perfume) return jsonError("perfume_not_found", 404);
  }

  const ids = body.recipients.map((r) => r.client_id);
  const { data: clientRows, error: cErr } = await admin
    .from("clients_v2")
    .select("id, first_name, email, phone")
    .in("id", ids)
    .eq("shop_id", shopId);
  if (cErr) return jsonError("db_error", 500, cErr.message);

  const byId = new Map((clientRows ?? []).map((c) => [c.id, c]));

  // 1. Create the campaign row. perfume_id est nullable (free-form).
  const { data: campaign, error: caErr } = await admin
    .from("newsletter_campaigns")
    .insert({
      shop_id: shopId,
      perfume_id: body.perfumeId ?? null,
      target_count: body.recipients.length,
      status: "sending",
      preview: body.recipients,
      subject: body.subject,
      body_md: body.body,
    })
    .select("id")
    .single();
  if (caErr) return jsonError("db_error", 500, caErr.message);

  // 2. Insert the recipient rows in pending state.
  const pendingRows = body.recipients.map((r) => ({
    campaign_id: campaign.id,
    client_id: r.client_id,
    score: r.score,
    channel: "email" as const,
    status: "pending" as const,
  }));
  await admin.from("newsletter_recipients").insert(pendingRows);

  // 3. Fan out via Resend. Sent sequentially with a small concurrency cap
  //    so we don't blow Resend's per-second quota.
  let sentCount = 0;
  let failedCount = 0;
  for (const r of body.recipients) {
    const client = byId.get(r.client_id);
    if (!client) {
      await admin
        .from("newsletter_recipients")
        .update({ status: "skipped", error: "client_disappeared" })
        .eq("campaign_id", campaign.id)
        .eq("client_id", r.client_id);
      failedCount++;
      continue;
    }

    try {
      if (!client.email) throw new Error("no_email");
      const personalisedBody = body.body.replaceAll("{{firstName}}", client.first_name);
      const personalisedSubject = body.subject.replaceAll("{{firstName}}", client.first_name);
      await sendEmail({
        to: client.email,
        subject: personalisedSubject,
        text: personalisedBody,
      });

      await admin
        .from("newsletter_recipients")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("campaign_id", campaign.id)
        .eq("client_id", r.client_id);
      sentCount++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await admin
        .from("newsletter_recipients")
        .update({ status: "failed", error: msg.slice(0, 300) })
        .eq("campaign_id", campaign.id)
        .eq("client_id", r.client_id);
      failedCount++;
    }
  }

  await admin
    .from("newsletter_campaigns")
    .update({
      status: failedCount === body.recipients.length ? "failed" : "sent",
      sent_at: new Date().toISOString(),
    })
    .eq("id", campaign.id);

  return jsonOk({
    campaignId: campaign.id,
    sent: sentCount,
    failed: failedCount,
    total: body.recipients.length,
  });
}
