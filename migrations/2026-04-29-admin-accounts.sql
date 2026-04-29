-- =====================================================================
-- 2026-04-29 — Tier "admin" + 6 comptes équipe La Niche
--
-- À lancer une fois dans le SQL Editor Supabase. Idempotent : safe à re-run.
--
-- Ce que ça fait :
--   1. Étend la CHECK constraint sur user_subscription.tier pour autoriser
--      la valeur 'admin' (en plus de free/curieux/initie/mecene).
--   2. Crée 6 comptes auth.users (admin1..admin6@laniche.app) si absents,
--      avec un mot de passe commun à changer à la première connexion.
--   3. Pose pour chacun une ligne user_subscription : tier='admin',
--      status='active', current_period_end = +10 ans (effectivement
--      perpétuel).
--
-- Côté code :
--   - src/lib/quota.ts : TIER_QUOTA['admin'] = tout en Infinity.
--   - src/lib/store.tsx : SubscriptionTier inclut 'admin'.
--
-- ⚠️  CHANGE LE MOT DE PASSE ('LaNiche2026!Admin') AVANT DE PARTAGER
--     LES ACCÈS, OU ROTATE-LE DÈS LA PREMIÈRE CONNEXION.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Étendre la CHECK constraint pour accepter 'admin'
-- ---------------------------------------------------------------------

ALTER TABLE public.user_subscription
  DROP CONSTRAINT IF EXISTS user_subscription_tier_check;

ALTER TABLE public.user_subscription
  ADD CONSTRAINT user_subscription_tier_check
  CHECK (tier IN ('free','curieux','initie','mecene','admin'));

-- ---------------------------------------------------------------------
-- 2. + 3. Création / upsert des 6 comptes admin
--
-- On boucle sur une liste (email, full_name). Le mot de passe est partagé
-- — change-le après ou demande à chaque admin de le rotate via /login
-- (recovery email).
-- ---------------------------------------------------------------------

DO $$
DECLARE
  admin_password text := 'LaNiche2026!Admin';
  admin_record   record;
  admin_id       uuid;
BEGIN
  FOR admin_record IN
    SELECT * FROM (VALUES
      ('admin1@laniche.app', 'Admin La Niche 1'),
      ('admin2@laniche.app', 'Admin La Niche 2'),
      ('admin3@laniche.app', 'Admin La Niche 3'),
      ('admin4@laniche.app', 'Admin La Niche 4'),
      ('admin5@laniche.app', 'Admin La Niche 5'),
      ('admin6@laniche.app', 'Admin La Niche 6')
    ) AS t(email, full_name)
  LOOP
    -- 1) Récupère l'id si le compte existe déjà
    SELECT id INTO admin_id
    FROM auth.users
    WHERE email = admin_record.email;

    -- 2) Sinon, crée auth.users + auth.identities
    IF admin_id IS NULL THEN
      admin_id := gen_random_uuid();

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
        admin_id,
        'authenticated',
        'authenticated',
        admin_record.email,
        crypt(admin_password, gen_salt('bf')),
        NOW(),
        '{"provider":"email","providers":["email"],"role":"admin"}'::jsonb,
        jsonb_build_object('full_name', admin_record.full_name, 'role', 'admin'),
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
        admin_id,
        jsonb_build_object(
          'sub', admin_id::text,
          'email', admin_record.email,
          'email_verified', true
        ),
        'email',
        admin_id::text,
        NOW(),
        NOW(),
        NOW()
      );
    END IF;

    -- 3) Upsert tier=admin, period_end = +10 ans (effectivement infini)
    INSERT INTO public.user_subscription (
      user_id,
      tier,
      billing_cycle,
      status,
      current_period_end,
      paypal_subscription_id,
      paypal_plan_id,
      updated_at
    ) VALUES (
      admin_id,
      'admin',
      'monthly',
      'active',
      NOW() + INTERVAL '10 years',
      NULL,
      NULL,
      NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      tier = EXCLUDED.tier,
      billing_cycle = EXCLUDED.billing_cycle,
      status = EXCLUDED.status,
      current_period_end = EXCLUDED.current_period_end,
      updated_at = NOW();

    RAISE NOTICE 'Admin prêt : % (id=%)', admin_record.email, admin_id;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- Vérification
-- ---------------------------------------------------------------------

-- SELECT u.email, s.tier, s.status, s.current_period_end
-- FROM auth.users u
-- JOIN public.user_subscription s ON s.user_id = u.id
-- WHERE s.tier = 'admin'
-- ORDER BY u.email;
