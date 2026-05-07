/**
 * /api/shops/me
 *
 *   GET   — returns the signed-in boutique's row.
 *   PATCH — owner updates name, address, opening_hours, etc.
 *
 * Used by /settings/horaires to configure the open-hours grid that drives
 * the in_service / out_service mode switching.
 */

import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { getOwnerShopId, jsonError, jsonOk } from "@/lib/auth-server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const shopId = await getOwnerShopId(req);
  if (!shopId) return jsonError("auth_required", 401);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("shops")
    .select("*")
    .eq("id", shopId)
    .maybeSingle();

  if (error) return jsonError("db_error", 500, error.message);
  if (!data) return jsonError("not_found", 404);
  return jsonOk({ shop: data });
}

type DayHours = { ouvert: boolean; debut: string; fin: string };
type OpeningHoursBody = Record<string, DayHours>;

type PatchBody = {
  name?: string;
  address_line?: string | null;
  postal_code?: string | null;
  city?: string | null;
  opening_hours?: OpeningHoursBody | null;
};

const VALID_DAYS = new Set([
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
  "dimanche",
]);

function isValidHHMM(s: string): boolean {
  return /^[0-2]\d:[0-5]\d$/.test(s);
}

export async function PATCH(req: NextRequest) {
  const shopId = await getOwnerShopId(req);
  if (!shopId) return jsonError("auth_required", 401);

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return jsonError("invalid_json", 400);
  }

  const update: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) {
    update.name = body.name.trim();
  }
  if (body.address_line !== undefined) {
    update.address_line = body.address_line?.trim() || null;
  }
  if (body.postal_code !== undefined) {
    update.postal_code = body.postal_code?.trim() || null;
  }
  if (body.city !== undefined) {
    update.city = body.city?.trim() || null;
  }

  if (body.opening_hours !== undefined) {
    if (body.opening_hours === null) {
      update.opening_hours = null;
    } else {
      // Defensive validation : reject anything that doesn't match the
      // expected shape so a malformed PATCH can't poison the UI.
      const sanitized: OpeningHoursBody = {};
      for (const [day, hours] of Object.entries(body.opening_hours)) {
        if (!VALID_DAYS.has(day)) continue;
        if (typeof hours !== "object" || hours === null) continue;
        if (typeof hours.ouvert !== "boolean") continue;
        if (typeof hours.debut !== "string" || !isValidHHMM(hours.debut)) continue;
        if (typeof hours.fin !== "string" || !isValidHHMM(hours.fin)) continue;
        sanitized[day] = {
          ouvert: hours.ouvert,
          debut: hours.debut,
          fin: hours.fin,
        };
      }
      update.opening_hours = sanitized;
    }
  }

  if (Object.keys(update).length === 0) {
    return jsonError("nothing_to_update", 400);
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("shops")
    .update(update)
    .eq("id", shopId)
    .select("*")
    .maybeSingle();

  if (error) return jsonError("db_error", 500, error.message);
  if (!data) return jsonError("not_found", 404);
  return jsonOk({ shop: data });
}
