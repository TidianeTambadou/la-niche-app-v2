/**
 * Server-side helpers : extract the calling user's identity from the Bearer
 * token attached to a Next.js route handler request, then check that they own
 * a row in `public.shops` (= boutique account).
 *
 * Returns null when the token is missing, expired, or the user isn't a shop.
 */

import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";

export async function getUserId(req: NextRequest): Promise<string | null> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const admin = createAdminClient();
  const { data } = await admin.auth.getUser(token);
  return data.user?.id ?? null;
}

export async function getOwnerShopId(req: NextRequest): Promise<string | null> {
  const userId = await getUserId(req);
  if (!userId) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("shops")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  return data?.id ?? null;
}

export function jsonOk(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export function jsonError(error: string, status = 400, detail?: string): Response {
  return Response.json({ error, ...(detail ? { detail } : {}) }, { status });
}
