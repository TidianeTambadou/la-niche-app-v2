/**
 * Resend wrapper. Server-only. Throws when RESEND_API_KEY is missing so
 * misconfiguration surfaces immediately rather than silently dropping mail.
 */

import { Resend } from "resend";

let cached: Resend | null = null;

function client(): Resend {
  if (cached) return cached;
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY missing");
  cached = new Resend(key);
  return cached;
}

const DEFAULT_FROM = process.env.RESEND_FROM || "La Niche <newsletter@laniche.app>";

export type SendEmailInput = {
  to: string;
  subject: string;
  /** Plain text fallback. Required by most ESPs to avoid spam scoring. */
  text: string;
  /** Optional HTML body. If omitted, `text` is wrapped in a minimal layout. */
  html?: string;
  replyTo?: string;
  from?: string;
};

export async function sendEmail(input: SendEmailInput): Promise<{ id: string }> {
  const html = input.html ?? `<pre style="font-family:Inter,system-ui,sans-serif;font-size:15px;line-height:1.55;white-space:pre-wrap">${escapeHTML(input.text)}</pre>`;
  const res = await client().emails.send({
    from: input.from ?? DEFAULT_FROM,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html,
    replyTo: input.replyTo,
  });
  if (res.error) throw new Error(res.error.message ?? "Resend failed");
  return { id: res.data?.id ?? "" };
}

function escapeHTML(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
