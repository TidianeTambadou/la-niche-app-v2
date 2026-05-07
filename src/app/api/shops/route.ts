/**
 * /api/shops — public list of boutiques. Used on the user-side
 * "Choisir une boutique" screen so customers can pick where to send
 * their olfactive profile.
 */

import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { jsonError, jsonOk } from "@/lib/auth-server";

export const runtime = "nodejs";

export async function GET(_req: NextRequest) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("shops")
    .select("id, name, address_line, postal_code, city, country, opening_hours")
    .order("name", { ascending: true });

  if (error) return jsonError("db_error", 500, error.message);
  return jsonOk({ shops: data ?? [] });
}
