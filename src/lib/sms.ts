/**
 * Twilio wrapper. Server-only. Lazy-loaded so the heavy Twilio SDK stays
 * out of any route handler that doesn't actually send SMS. Throws on missing
 * env so misconfiguration is loud.
 */

import twilio from "twilio";
import type { Twilio } from "twilio";

let cached: Twilio | null = null;

function client(): Twilio {
  if (cached) return cached;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error("TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN missing");
  cached = twilio(sid, token);
  return cached;
}

export async function sendSMS(input: { to: string; body: string }): Promise<{ sid: string }> {
  const from = process.env.TWILIO_FROM_PHONE;
  if (!from) throw new Error("TWILIO_FROM_PHONE missing");
  // Normalise FR mobile numbers : "06 12 34 56 78" → "+33612345678"
  const to = normalizeFR(input.to);
  const msg = await client().messages.create({ from, to, body: input.body });
  return { sid: msg.sid };
}

function normalizeFR(raw: string): string {
  const digits = raw.replace(/[\s.\-()]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  if (digits.startsWith("0") && digits.length === 10) return `+33${digits.slice(1)}`;
  return digits;
}
