-- =====================================================================
-- 2026-04-25 — Fix "permission denied for table shops" on mobile app
--
-- Root cause:
--   The 2026-04-22 migration created public-read RLS policies on
--   public.shops + public.shop_stock, but Postgres still blocks the
--   query at the GRANT layer (which is checked BEFORE RLS).
--   Result: the mobile client (anon or authenticated role) gets
--   `permission denied for table shops` instead of an empty set.
--
-- Fix: grant SELECT on both tables to anon + authenticated. RLS stays
--      ON, so the public-read policies still gate which rows are
--      visible — we are only opening the table at the role level.
--
-- Idempotent. Safe to re-run. Run in the Supabase SQL editor.
-- =====================================================================

GRANT SELECT ON public.shops      TO anon, authenticated;
GRANT SELECT ON public.shop_stock TO anon, authenticated;

-- Verification (run manually):
--   SET ROLE anon;
--   SELECT count(*) FROM public.shops;        -- should succeed
--   SELECT count(*) FROM public.shop_stock;   -- should succeed
--   RESET ROLE;
