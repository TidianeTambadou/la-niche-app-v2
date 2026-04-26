/**
 * /api/usage — single GET endpoint that returns the authenticated user's
 * current tier + monthly counters. The client store hydrates from this on
 * auth ready and treats it as the source of truth (localStorage becomes
 * a write-through cache).
 *
 * Auth: Bearer access token from supabase.auth.getSession() in the client.
 */

import { getUsageSummary, requireUserId } from "@/lib/quota";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const userId = await requireUserId(req);
  if (!userId) {
    return Response.json({ error: "auth_required" }, { status: 401 });
  }
  try {
    const summary = await getUsageSummary(userId);
    return Response.json(summary);
  } catch (e) {
    return Response.json(
      { error: "internal_error", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
