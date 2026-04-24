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

const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const envAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const url = envUrl ?? "https://nmcsfdgqnttanufydjer.supabase.co";
const anon = envAnon ?? "sb_publishable_bld-zRED6KZAPIJIvf66Ew_DPVrtW-9";

if (typeof window !== "undefined" && (!envUrl || !envAnon)) {
  // Visible in browser devtools so misconfigured deploys are obvious.
  console.warn(
    "[supabase] NEXT_PUBLIC_SUPABASE_URL or _ANON_KEY missing — using build-time fallback. Auth will fail if the fallback project is no longer active.",
  );
}

export const supabase = createClient(url, anon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // PKCE is safer for SPAs and produces clearer redirect errors than the
    // legacy implicit flow when magic-link / email-confirm returns come in.
    flowType: "pkce",
  },
});
