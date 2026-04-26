import { createClient } from "@supabase/supabase-js";

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://nmcsfdgqnttanufydjer.supabase.co";

/** Admin client — uses the service-role key, bypasses RLS.
 *  Only for server-side API routes. Never import on the client. */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
