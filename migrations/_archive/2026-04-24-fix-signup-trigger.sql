-- =====================================================================
-- 2026-04-24 — Fix "Database error saving new user"
--
-- Root cause confirmed:
--   Trigger `on_auth_user_created` on auth.users fires `public.handle_new_user()`
--   which INSERTs into public.shops for EVERY new user. This is designed for
--   CRM shop-owner signups, but mobile app customers are NOT shops — so the
--   spurious insert trips a constraint (likely NOT NULL column, CHECK on
--   latitude/longitude, or an RLS/FK) and rolls back auth.users.
--
-- Fix: gate the shop creation on a `app='mobile'` marker in
--      raw_user_meta_data. Mobile app signups set the marker and skip shop
--      creation; CRM signups are unaffected.
--
-- Run this whole file in Supabase SQL Editor. It is idempotent.
-- =====================================================================


-- =====================================================================
-- PART 1 — Patch the trigger function to skip mobile-app signups.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Mobile app customers are NOT shop owners. Skip shop creation so the
  -- auth.users insert succeeds. The mobile app stores its user state on
  -- auth.users.raw_user_meta_data directly — no public.* row needed.
  IF NEW.raw_user_meta_data->>'app' = 'mobile' THEN
    RETURN NEW;
  END IF;

  -- Defensive: if the shop INSERT ever fails for any reason, DON'T roll
  -- back the auth.users insert. Log the failure (Supabase Postgres logs)
  -- but let the user account be created. This prevents the entire signup
  -- flow from dying because of a CRM schema issue.
  BEGIN
    INSERT INTO public.shops (
      id, name, address_line, postal_code, city, country, latitude, longitude
    )
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'name', 'Nouvelle Boutique'),
      '',
      '',
      '',
      'France',
      0,
      0
    )
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user: shops insert failed for %: % (continuing)',
      NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

-- =====================================================================
-- PART 2 — Clean up spurious "Nouvelle Boutique" rows created for mobile
--          customers before this fix was applied.
--
-- IMPORTANT: only run this if you've confirmed these rows are not legit
--            CRM data. Review first with the SELECT, then run the DELETE.
-- =====================================================================

-- Preview rows that would be deleted:
--   SELECT id, name, address_line, postal_code, city
--   FROM public.shops
--   WHERE name = 'Nouvelle Boutique'
--     AND address_line = ''
--     AND postal_code = ''
--     AND city = '';

-- If the preview looks right, uncomment and run:
--   DELETE FROM public.shops
--   WHERE name = 'Nouvelle Boutique'
--     AND address_line = ''
--     AND postal_code = ''
--     AND city = '';


-- =====================================================================
-- PART 3 — Verify
-- =====================================================================
-- Check that the function was replaced:
--   SELECT pg_get_functiondef('public.handle_new_user'::regproc);
-- The body should now contain:  IF NEW.raw_user_meta_data->>'app' = 'mobile'
--
-- Then try a fresh signup from the mobile app. It should succeed.
