-- =====================================================================
-- 2026-04-29 — Fiches clients en boutique (mode "Pour un client")
--
-- À lancer une fois dans le SQL Editor Supabase. Idempotent.
--
-- Contexte :
--   Quand le compte connecté est une boutique (ligne dans `public.shops`
--   avec id = auth.uid()), la feature "Pour un ami" devient "Pour un
--   client" : la boutique demande le prénom/nom du client réel, fait le
--   quiz, génère le rapport vendeur, et la fiche est sauvegardée pour la
--   retrouver plus tard via le menu "Mes clients".
--
-- Ce que ça fait :
--   1. Table public.boutique_clients (1 ligne par fiche client).
--   2. RLS : la boutique propriétaire (shop_id = auth.uid()) lit/écrit
--      ses propres fiches uniquement.
--   3. Trigger updated_at.
--   4. Crée 2 comptes boutique de démo (amro@laniche.app, gda@laniche.app)
--      avec ligne `shops` correspondante. Mot de passe partagé à rotater.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Table boutique_clients
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.boutique_clients (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  first_name      text NOT NULL,
  last_name       text NOT NULL,
  -- Réponses du quiz "pour un ami" (clé → string | string[])
  quiz_answers    jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- ADN olfactif extrait par l'analyseur
  dna             jsonb,
  -- Cartes swipées pendant la session
  matched_cards   jsonb NOT NULL DEFAULT '[]'::jsonb,
  disliked_cards  jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Rapport vendeur final (FriendReport)
  report          jsonb,
  -- Notes libres que la boutique peut éditer après coup
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_boutique_clients_shop
  ON public.boutique_clients (shop_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_boutique_clients_search
  ON public.boutique_clients
  USING gin (
    to_tsvector('french', coalesce(first_name, '') || ' ' || coalesce(last_name, ''))
  );

-- ---------------------------------------------------------------------
-- 2. Trigger updated_at
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_boutique_clients_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_boutique_clients_updated_at ON public.boutique_clients;
CREATE TRIGGER trg_boutique_clients_updated_at
  BEFORE UPDATE ON public.boutique_clients
  FOR EACH ROW
  EXECUTE FUNCTION public.set_boutique_clients_updated_at();

-- ---------------------------------------------------------------------
-- 3. RLS : seul le propriétaire de la boutique (shops.id = auth.uid())
--    peut lire et écrire ses fiches.
-- ---------------------------------------------------------------------

ALTER TABLE public.boutique_clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shop_owner_reads_clients" ON public.boutique_clients;
CREATE POLICY "shop_owner_reads_clients"
  ON public.boutique_clients
  FOR SELECT
  TO authenticated
  USING (shop_id = auth.uid());

DROP POLICY IF EXISTS "shop_owner_inserts_clients" ON public.boutique_clients;
CREATE POLICY "shop_owner_inserts_clients"
  ON public.boutique_clients
  FOR INSERT
  TO authenticated
  WITH CHECK (shop_id = auth.uid());

DROP POLICY IF EXISTS "shop_owner_updates_clients" ON public.boutique_clients;
CREATE POLICY "shop_owner_updates_clients"
  ON public.boutique_clients
  FOR UPDATE
  TO authenticated
  USING (shop_id = auth.uid())
  WITH CHECK (shop_id = auth.uid());

DROP POLICY IF EXISTS "shop_owner_deletes_clients" ON public.boutique_clients;
CREATE POLICY "shop_owner_deletes_clients"
  ON public.boutique_clients
  FOR DELETE
  TO authenticated
  USING (shop_id = auth.uid());

-- ---------------------------------------------------------------------
-- 4. Comptes boutique de démo : amro & gda
--
-- La convention CRM = `shops.id = auth.users.id`. On crée le user, puis
-- on aligne shops.id sur ce uuid. Idempotent : si l'email existe on
-- récupère juste l'id. ⚠️ change le mot de passe partagé après usage.
-- ---------------------------------------------------------------------

DO $$
DECLARE
  shared_password text := 'LaNiche2026!Boutique';
  shop_record record;
  user_id uuid;
BEGIN
  FOR shop_record IN
    SELECT * FROM (VALUES
      ('amro@laniche.app', 'AMRO Parfumerie',  'AMRO',  'Paris'),
      ('gda@laniche.app',  'GDA Parfumerie',   'GDA',   'Paris')
    ) AS t(email, name, short_label, city)
  LOOP
    SELECT id INTO user_id
    FROM auth.users
    WHERE email = shop_record.email;

    IF user_id IS NULL THEN
      user_id := gen_random_uuid();

      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at,
        confirmation_token, email_change, email_change_token_new, recovery_token
      ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        user_id,
        'authenticated',
        'authenticated',
        shop_record.email,
        crypt(shared_password, gen_salt('bf')),
        NOW(),
        '{"provider":"email","providers":["email"],"role":"boutique"}'::jsonb,
        jsonb_build_object('full_name', shop_record.name, 'role', 'boutique'),
        NOW(),
        NOW(),
        '', '', '', ''
      );

      INSERT INTO auth.identities (
        id, user_id, identity_data, provider, provider_id,
        last_sign_in_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(),
        user_id,
        jsonb_build_object(
          'sub', user_id::text,
          'email', shop_record.email,
          'email_verified', true
        ),
        'email',
        user_id::text,
        NOW(),
        NOW(),
        NOW()
      );
    END IF;

    -- Upsert shop avec l'id = auth.uid (convention CRM).
    INSERT INTO public.shops (id, name, city, country, created_at)
    VALUES (user_id, shop_record.name, shop_record.city, 'FR', NOW())
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      city = EXCLUDED.city,
      updated_at = NOW();

    RAISE NOTICE 'Boutique prête : % (id=%)', shop_record.email, user_id;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- Vérifications
-- ---------------------------------------------------------------------

-- SELECT u.email, s.name, s.city
-- FROM auth.users u
-- JOIN public.shops s ON s.id = u.id
-- WHERE u.email IN ('amro@laniche.app','gda@laniche.app');

-- SELECT count(*) FROM public.boutique_clients; -- 0 au début
