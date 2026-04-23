import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client. NEXT_PUBLIC_* env vars are baked into the client bundle at
 * build time, so they MUST be set in the build environment (Vercel project
 * settings → Environment Variables), not just at runtime.
 *
 * If absent at build time, we fall back to a placeholder so the build can
 * complete (e.g. when generating the static /_not-found page). Any actual auth
 * or data call will fail with a clear network error in that case — the warning
 * below should make the misconfiguration visible.
 */

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://nmcsfdgqnttanufydjer.supabase.co";
const anon =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "sb_publishable_bld-zRED6KZAPIJIvf66Ew_DPVrtW-9";

export const supabase = createClient(
  url,
  anon,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
