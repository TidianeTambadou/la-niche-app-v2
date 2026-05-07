-- =====================================================================
-- 2026-04-29 — Inject test Mécène account
--
-- Crée tidiane@mecene.com / @Tidiane1 et lui ajoute un user_subscription
-- en tier=mecene, status=active, period_end=+1 an. PayPal non branché —
-- c'est un compte de test pour valider le quota illimité + le bouton
-- WhatsApp Mécène sans passer par le checkout sandbox.
--
-- Idempotent : si l'email existe déjà, on récupère son id et on met juste
-- à jour la subscription. Safe à re-run.
--
-- ⚠️ NE LANCE PAS CE SCRIPT EN PROD UNE FOIS QUE TU AS DE VRAIS USERS.
--    C'est un raccourci de dev — pour donner Mécène à quelqu'un en prod,
--    passe par PayPal (pour la vraie facturation) ou un UPDATE manuel
--    contrôlé.
-- =====================================================================

DO $$
DECLARE
  tidiane_id uuid;
BEGIN
  -- 1. Crée le compte auth (ou récupère l'id s'il existe déjà).
  SELECT id INTO tidiane_id
  FROM auth.users
  WHERE email = 'tidiane@mecene.com';

  IF tidiane_id IS NULL THEN
    tidiane_id := gen_random_uuid();

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
      tidiane_id,
      'authenticated',
      'authenticated',
      'tidiane@mecene.com',
      crypt('@Tidiane1', gen_salt('bf')),
      NOW(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Tidiane (Mécène test)"}'::jsonb,
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
      tidiane_id,
      jsonb_build_object(
        'sub', tidiane_id::text,
        'email', 'tidiane@mecene.com',
        'email_verified', true
      ),
      'email',
      tidiane_id::text,
      NOW(),
      NOW(),
      NOW()
    );
  END IF;

  -- 2. Upsert dans user_subscription — tier=mecene, période 1 an, status=active.
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
    tidiane_id,
    'mecene',
    'monthly',
    'active',
    NOW() + INTERVAL '1 year',
    NULL,                  -- pas de subscription PayPal réelle
    NULL,
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    tier = EXCLUDED.tier,
    billing_cycle = EXCLUDED.billing_cycle,
    status = EXCLUDED.status,
    current_period_end = EXCLUDED.current_period_end,
    updated_at = NOW();

  RAISE NOTICE 'Compte test Mécène prêt : tidiane@mecene.com (id=%)', tidiane_id;
END $$;

-- Vérification :
--   SELECT u.email, s.tier, s.status, s.current_period_end
--   FROM auth.users u
--   JOIN public.user_subscription s ON s.user_id = u.id
--   WHERE u.email = 'tidiane@mecene.com';
