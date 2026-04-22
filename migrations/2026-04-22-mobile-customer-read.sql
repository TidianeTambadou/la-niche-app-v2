-- =====================================================================
-- 2026-04-22 — Mobile customer read access
--
-- Run in the Supabase SQL editor of the SAME project as the CRM.
--
-- The CRM owns shops + shop_stock with strict RLS:
--   - shops:       only the owner (auth.uid() = id) can read/write
--   - shop_stock:  only the owner (auth.uid() = shop_id) can read/write
--
-- The customer-facing mobile app needs to BROWSE shops + their stock
-- across all owners. We add public-read policies (anon + authenticated)
-- and leave the existing write policies untouched.
-- =====================================================================

-- shops: public read
DROP POLICY IF EXISTS "shops: public read" ON public.shops;
CREATE POLICY "shops: public read"
    ON public.shops
    FOR SELECT
    USING (true);

-- shop_stock: public read
DROP POLICY IF EXISTS "shop_stock: public read" ON public.shop_stock;
CREATE POLICY "shop_stock: public read"
    ON public.shop_stock
    FOR SELECT
    USING (true);

-- Sanity: make sure RLS is on (no-op if already enabled)
ALTER TABLE public.shops       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_stock  ENABLE ROW LEVEL SECURITY;

-- Verification queries (run manually after the policies above):
--   SELECT count(*) FROM public.shops;        -- should return total shops
--   SELECT count(*) FROM public.shop_stock;   -- should return total items
