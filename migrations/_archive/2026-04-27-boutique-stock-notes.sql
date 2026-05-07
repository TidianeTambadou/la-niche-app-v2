-- =====================================================================
-- 2026-04-27 — Boutique accounts + auto-enriched stock notes
--
-- One-shot migration. Run it in the Supabase SQL Editor of the same
-- project as the CRM. Idempotent — safe to re-run.
--
-- What it does:
--   PART A — Adds note pyramid + family columns to public.shop_stock so
--            boutique imports can carry the data the balade-guidée
--            recommendation engine needs.
--   PART B — Creates the auth user maisongda@gmail.com / @maisongda1 if
--            it doesn't exist yet (no Dashboard step required).
--   PART C — Wipes every other shop + stock row, then provisions the
--            Maison GDA shop linked to that auth user.
--   PART D — Locks down RLS so only the shop owner can write its own
--            stock from the mobile app's authenticated client.
-- =====================================================================

-- =====================================================================
-- PART A — Schema: notes + family
-- =====================================================================

ALTER TABLE public.shop_stock
  ADD COLUMN IF NOT EXISTS notes_top   text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS notes_heart text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS notes_base  text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS family      text;

-- =====================================================================
-- PART B — Create the Maison GDA auth user (if absent)
--
-- Direct insert into auth.users + auth.identities. Password is hashed
-- with bcrypt via pgcrypto's crypt() function. The handle_new_user()
-- trigger fires on this insert and auto-creates a placeholder row in
-- public.shops — PART C below renames it to "Maison GDA".
-- =====================================================================

DO $$
DECLARE
  maisongda_id uuid;
BEGIN
  SELECT id INTO maisongda_id
  FROM auth.users
  WHERE email = 'maisongda@gmail.com';

  IF maisongda_id IS NULL THEN
    maisongda_id := gen_random_uuid();

    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      maisongda_id,
      'authenticated',
      'authenticated',
      'maisongda@gmail.com',
      crypt('@maisongda1', gen_salt('bf')),
      NOW(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"shop_name":"Maison GDA"}'::jsonb,
      NOW(),
      NOW(),
      '',
      '',
      '',
      ''
    );

    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      maisongda_id,
      jsonb_build_object('sub', maisongda_id::text, 'email', 'maisongda@gmail.com', 'email_verified', true),
      'email',
      maisongda_id::text,
      NOW(),
      NOW(),
      NOW()
    );
  END IF;

  -- Stash the id in a temp setting so PART C can read it without re-querying.
  PERFORM set_config('app.maisongda_id', maisongda_id::text, true);
END $$;

-- =====================================================================
-- PART C — Wipe other shops & provision Maison GDA
-- =====================================================================

DO $$
DECLARE
  maisongda_id uuid := current_setting('app.maisongda_id', true)::uuid;
BEGIN
  IF maisongda_id IS NULL THEN
    SELECT id INTO maisongda_id FROM auth.users WHERE email = 'maisongda@gmail.com';
  END IF;

  DELETE FROM public.shop_stock WHERE shop_id <> maisongda_id;
  DELETE FROM public.shops      WHERE id      <> maisongda_id;

  INSERT INTO public.shops (id, name, address_line, postal_code, city, country, latitude, longitude)
  VALUES (maisongda_id, 'Maison GDA', '', '', 'Paris', 'France', 0, 0)
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
END $$;

-- =====================================================================
-- PART D — RLS for shop owners
--   Owners can write their own stock from the mobile app. Public read
--   policies from earlier migrations stay in place.
-- =====================================================================

DROP POLICY IF EXISTS "shop_stock: owner write" ON public.shop_stock;
CREATE POLICY "shop_stock: owner write"
  ON public.shop_stock
  FOR ALL
  TO authenticated
  USING      (auth.uid() = shop_id)
  WITH CHECK (auth.uid() = shop_id);

DROP POLICY IF EXISTS "shops: owner update" ON public.shops;
CREATE POLICY "shops: owner update"
  ON public.shops
  FOR UPDATE
  TO authenticated
  USING      (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

GRANT INSERT, UPDATE, DELETE ON public.shop_stock TO authenticated;
GRANT UPDATE                  ON public.shops      TO authenticated;

-- =====================================================================
-- Verification (run manually after the migration completes)
--   SELECT count(*) FROM public.shops;          -- expect 1 (Maison GDA)
--   SELECT count(*) FROM public.shop_stock;     -- expect 0 initially
--   SELECT name FROM public.shops;              -- expect 'Maison GDA'
--   SELECT email FROM auth.users
--     WHERE email = 'maisongda@gmail.com';      -- expect 1 row
-- =====================================================================
