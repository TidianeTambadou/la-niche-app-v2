-- =====================================================================
-- 2026-05-07 — La Niche v2 schema (additif, non-destructif)
--
-- À lancer une fois dans le SQL Editor Supabase. Idempotent.
--
-- ⚠️  master (v2) et legacy-v1 partagent la même base Supabase. Cette
--     migration NE TOUCHE PAS aux tables v1 (boutique_clients, shop_stock,
--     referrals, usage_log…). Les deux branches cohabitent :
--       - legacy-v1 → tables `public.boutique_clients`, `public.shop_stock`, …
--       - master    → tables `public.clients_v2`, `public.shop_questions`, …
--
-- Tables créées :
--   - public.clients_v2            (fiche client v2)
--   - public.shop_questions        (questionnaire dynamique)
--   - public.shop_perfumes         (stock parfums v2 propre)
--   - public.newsletter_campaigns
--   - public.newsletter_recipients
--
-- RLS partout, basée sur la convention `shops.id = auth.uid()`. `shops`
-- et `auth.*` ne sont pas modifiés.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Trigger générique updated_at — préfixé pour ne pas collisionner avec
--    une éventuelle fonction homonyme côté v1.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_v2_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------
-- 2. clients_v2 — fiche client v2
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.clients_v2 (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id            uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  user_id            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source             text NOT NULL CHECK (source IN ('in_shop', 'user_account')),
  first_name         text NOT NULL,
  last_name          text NOT NULL,
  email              text,
  phone              text,
  address_line       text,
  postal_code        text,
  city               text,
  latitude           double precision,
  longitude          double precision,
  preferred_channel  text NOT NULL DEFAULT 'email'
                     CHECK (preferred_channel IN ('email', 'sms', 'both')),
  consent_marketing  boolean NOT NULL DEFAULT false,
  consent_at         timestamptz,
  quiz_answers       jsonb NOT NULL DEFAULT '{}'::jsonb,
  olfactive_profile  jsonb,
  report             jsonb,
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT clients_v2_has_contact CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

-- Colonnes adresse — ajoutées par ALTER pour les bases déjà migrées avant
-- le 2026-05-08. Sur une base neuve, le CREATE TABLE plus haut les contient
-- déjà ; les ALTER deviennent des no-ops grâce à IF NOT EXISTS.
ALTER TABLE public.clients_v2 ADD COLUMN IF NOT EXISTS address_line  text;
ALTER TABLE public.clients_v2 ADD COLUMN IF NOT EXISTS postal_code   text;
ALTER TABLE public.clients_v2 ADD COLUMN IF NOT EXISTS city          text;
ALTER TABLE public.clients_v2 ADD COLUMN IF NOT EXISTS latitude      double precision;
ALTER TABLE public.clients_v2 ADD COLUMN IF NOT EXISTS longitude     double precision;

CREATE INDEX IF NOT EXISTS idx_clients_v2_shop_created
  ON public.clients_v2 (shop_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_clients_v2_shop_source
  ON public.clients_v2 (shop_id, source);

CREATE INDEX IF NOT EXISTS idx_clients_v2_search
  ON public.clients_v2
  USING gin (
    to_tsvector('french',
      coalesce(first_name, '') || ' ' || coalesce(last_name, '') || ' ' || coalesce(email, ''))
  );

DROP TRIGGER IF EXISTS trg_clients_v2_updated_at ON public.clients_v2;
CREATE TRIGGER trg_clients_v2_updated_at
  BEFORE UPDATE ON public.clients_v2
  FOR EACH ROW
  EXECUTE FUNCTION public.set_v2_updated_at();

ALTER TABLE public.clients_v2 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "v2_shop_owner_reads_clients" ON public.clients_v2;
CREATE POLICY "v2_shop_owner_reads_clients"
  ON public.clients_v2 FOR SELECT TO authenticated
  USING (shop_id = auth.uid());

DROP POLICY IF EXISTS "v2_shop_owner_writes_clients" ON public.clients_v2;
CREATE POLICY "v2_shop_owner_writes_clients"
  ON public.clients_v2 FOR INSERT TO authenticated
  WITH CHECK (shop_id = auth.uid());

DROP POLICY IF EXISTS "v2_shop_owner_updates_clients" ON public.clients_v2;
CREATE POLICY "v2_shop_owner_updates_clients"
  ON public.clients_v2 FOR UPDATE TO authenticated
  USING (shop_id = auth.uid())
  WITH CHECK (shop_id = auth.uid());

DROP POLICY IF EXISTS "v2_shop_owner_deletes_clients" ON public.clients_v2;
CREATE POLICY "v2_shop_owner_deletes_clients"
  ON public.clients_v2 FOR DELETE TO authenticated
  USING (shop_id = auth.uid());

DROP POLICY IF EXISTS "v2_user_reads_own_client_card" ON public.clients_v2;
CREATE POLICY "v2_user_reads_own_client_card"
  ON public.clients_v2 FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 3. shop_questions — questionnaire dynamique
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.shop_questions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id     uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  position    integer NOT NULL,
  label       text NOT NULL,
  kind        text NOT NULL
              CHECK (kind IN ('text', 'single', 'multi', 'scale', 'email', 'phone')),
  options     jsonb,
  required    boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (shop_id, position)
);

CREATE INDEX IF NOT EXISTS idx_shop_questions_shop_position
  ON public.shop_questions (shop_id, position);

DROP TRIGGER IF EXISTS trg_shop_questions_updated_at ON public.shop_questions;
CREATE TRIGGER trg_shop_questions_updated_at
  BEFORE UPDATE ON public.shop_questions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_v2_updated_at();

ALTER TABLE public.shop_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shop_questions_public_read" ON public.shop_questions;
CREATE POLICY "shop_questions_public_read"
  ON public.shop_questions FOR SELECT TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "shop_owner_writes_questions" ON public.shop_questions;
CREATE POLICY "shop_owner_writes_questions"
  ON public.shop_questions FOR INSERT TO authenticated
  WITH CHECK (shop_id = auth.uid());

DROP POLICY IF EXISTS "shop_owner_updates_questions" ON public.shop_questions;
CREATE POLICY "shop_owner_updates_questions"
  ON public.shop_questions FOR UPDATE TO authenticated
  USING (shop_id = auth.uid())
  WITH CHECK (shop_id = auth.uid());

DROP POLICY IF EXISTS "shop_owner_deletes_questions" ON public.shop_questions;
CREATE POLICY "shop_owner_deletes_questions"
  ON public.shop_questions FOR DELETE TO authenticated
  USING (shop_id = auth.uid());

-- ---------------------------------------------------------------------
-- 4. shop_perfumes — stock parfums v2 (propre, pas de migration depuis shop_stock)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.shop_perfumes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id      uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  name         text NOT NULL,
  brand        text NOT NULL,
  family       text,
  top_notes    text[] NOT NULL DEFAULT '{}',
  heart_notes  text[] NOT NULL DEFAULT '{}',
  base_notes   text[] NOT NULL DEFAULT '{}',
  accords      text[] NOT NULL DEFAULT '{}',
  description  text,
  image_url    text,
  price_eur    numeric(10, 2),
  in_stock     boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Unicité (shop, brand, name) en case-insensitive : Postgres n'autorise pas
-- d'expressions dans une contrainte UNIQUE inline, on passe par un index.
CREATE UNIQUE INDEX IF NOT EXISTS uq_shop_perfumes_shop_brand_name
  ON public.shop_perfumes (shop_id, lower(brand), lower(name));

CREATE INDEX IF NOT EXISTS idx_shop_perfumes_shop ON public.shop_perfumes (shop_id);
CREATE INDEX IF NOT EXISTS idx_shop_perfumes_in_stock ON public.shop_perfumes (shop_id, in_stock);

DROP TRIGGER IF EXISTS trg_shop_perfumes_updated_at ON public.shop_perfumes;
CREATE TRIGGER trg_shop_perfumes_updated_at
  BEFORE UPDATE ON public.shop_perfumes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_v2_updated_at();

ALTER TABLE public.shop_perfumes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shop_perfumes_public_read" ON public.shop_perfumes;
CREATE POLICY "shop_perfumes_public_read"
  ON public.shop_perfumes FOR SELECT TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "shop_owner_writes_perfumes" ON public.shop_perfumes;
CREATE POLICY "shop_owner_writes_perfumes"
  ON public.shop_perfumes FOR INSERT TO authenticated
  WITH CHECK (shop_id = auth.uid());

DROP POLICY IF EXISTS "shop_owner_updates_perfumes" ON public.shop_perfumes;
CREATE POLICY "shop_owner_updates_perfumes"
  ON public.shop_perfumes FOR UPDATE TO authenticated
  USING (shop_id = auth.uid())
  WITH CHECK (shop_id = auth.uid());

DROP POLICY IF EXISTS "shop_owner_deletes_perfumes" ON public.shop_perfumes;
CREATE POLICY "shop_owner_deletes_perfumes"
  ON public.shop_perfumes FOR DELETE TO authenticated
  USING (shop_id = auth.uid());

-- ---------------------------------------------------------------------
-- 5. newsletter_campaigns + newsletter_recipients
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.newsletter_campaigns (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id       uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  perfume_id    uuid NOT NULL REFERENCES public.shop_perfumes(id) ON DELETE CASCADE,
  target_count  integer NOT NULL CHECK (target_count > 0),
  status        text NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'sending', 'sent', 'failed')),
  preview       jsonb,
  subject       text,
  body_md       text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  sent_at       timestamptz
);

CREATE INDEX IF NOT EXISTS idx_campaigns_shop
  ON public.newsletter_campaigns (shop_id, created_at DESC);

ALTER TABLE public.newsletter_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shop_owner_reads_campaigns" ON public.newsletter_campaigns;
CREATE POLICY "shop_owner_reads_campaigns"
  ON public.newsletter_campaigns FOR SELECT TO authenticated
  USING (shop_id = auth.uid());

DROP POLICY IF EXISTS "shop_owner_writes_campaigns" ON public.newsletter_campaigns;
CREATE POLICY "shop_owner_writes_campaigns"
  ON public.newsletter_campaigns FOR INSERT TO authenticated
  WITH CHECK (shop_id = auth.uid());

DROP POLICY IF EXISTS "shop_owner_updates_campaigns" ON public.newsletter_campaigns;
CREATE POLICY "shop_owner_updates_campaigns"
  ON public.newsletter_campaigns FOR UPDATE TO authenticated
  USING (shop_id = auth.uid())
  WITH CHECK (shop_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.newsletter_recipients (
  campaign_id  uuid NOT NULL REFERENCES public.newsletter_campaigns(id) ON DELETE CASCADE,
  client_id    uuid NOT NULL REFERENCES public.clients_v2(id) ON DELETE CASCADE,
  score        numeric(6, 4) NOT NULL,
  channel      text NOT NULL CHECK (channel IN ('email', 'sms')),
  status       text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  error        text,
  sent_at      timestamptz,
  PRIMARY KEY (campaign_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_recipients_campaign
  ON public.newsletter_recipients (campaign_id);
CREATE INDEX IF NOT EXISTS idx_recipients_status
  ON public.newsletter_recipients (status, campaign_id);

ALTER TABLE public.newsletter_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shop_owner_reads_recipients" ON public.newsletter_recipients;
CREATE POLICY "shop_owner_reads_recipients"
  ON public.newsletter_recipients FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.newsletter_campaigns c
      WHERE c.id = newsletter_recipients.campaign_id
        AND c.shop_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "shop_owner_writes_recipients" ON public.newsletter_recipients;
CREATE POLICY "shop_owner_writes_recipients"
  ON public.newsletter_recipients FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.newsletter_campaigns c
      WHERE c.id = newsletter_recipients.campaign_id
        AND c.shop_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "shop_owner_updates_recipients" ON public.newsletter_recipients;
CREATE POLICY "shop_owner_updates_recipients"
  ON public.newsletter_recipients FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.newsletter_campaigns c
      WHERE c.id = newsletter_recipients.campaign_id
        AND c.shop_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- 6. Seed : questionnaire par défaut pour chaque boutique existante.
--
-- ⚠️  Le seed ne touche PAS les boutiques qui ont déjà des questions.
--     Pour repartir du seed à jour quand tu changes la liste, exécute
--     d'abord (manuellement, hors migration) :
--
--         DELETE FROM public.shop_questions;
--
--     puis relance la migration.
-- ---------------------------------------------------------------------

DO $$
DECLARE
  s record;
BEGIN
  FOR s IN SELECT id FROM public.shops LOOP
    IF EXISTS (SELECT 1 FROM public.shop_questions WHERE shop_id = s.id) THEN
      CONTINUE;
    END IF;

    -- Reprend l'esprit v1 : questions formulées en termes de VIBE et de
    -- LIFESTYLE plutôt que de jargon olfactif. Chaque option contient un
    -- exemple entre parenthèses pour qu'un client qui n'y connaît rien
    -- puisse répondre sans réfléchir.
    INSERT INTO public.shop_questions (shop_id, position, label, kind, options, required) VALUES
      (s.id, 1, 'Quelle vibe générale ?', 'single',
        jsonb_build_array(
          'Jeune frais — street, décontracté',
          'Classique distingué — pro chic',
          'Rockstar — nuit, clubbing',
          'Bohème — naturel, sans prise de tête'
        ),
        true),

      (s.id, 2, 'À qui veut plaire le client ?', 'single',
        jsonb_build_array(
          'Aux femmes — faire tourner la tête',
          'Aux hommes',
          'Tout le monde — bonne vibe globale',
          'À soi d''abord — faut kiffer avant tout'
        ),
        true),

      (s.id, 3, 'Plutôt chaud ou plutôt frais ?', 'single',
        jsonb_build_array(
          'Frais — agrumes, menthe, marin',
          'Chaud — cuir, épices, vanille',
          'Entre les deux, selon l''humeur'
        ),
        true),

      (s.id, 4, 'Qu''est-ce qui le fait kiffer ? (plusieurs choix)', 'multi',
        jsonb_build_array(
          'Sucré / gourmand (vanille, caramel)',
          'Fruité (pêche, pomme, fruits rouges)',
          'Boisé / sec (cèdre, santal)',
          'Floral (rose, jasmin, iris)',
          'Citrus / frais (bergamote, citron)',
          'Fumé / mystérieux (oud, encens, tabac)',
          'Cuir, musqué, animal'
        ),
        true),

      (s.id, 5, 'Quelle intensité ?', 'single',
        jsonb_build_array(
          'Discret — sillage intime',
          'Présent — sentu à 1 mètre',
          'Marquant — on se retourne dans la rue'
        ),
        true),

      (s.id, 6, 'Pour quelle occasion ?', 'single',
        jsonb_build_array(
          'Tous les jours / casual',
          'Bosser, réunions, pro',
          'Dates, séduction',
          'Soirées, clubs, la nuit'
        ),
        true),

      (s.id, 7, 'Budget par flacon ?', 'single',
        jsonb_build_array(
          'Moins de 100 €',
          '100 à 200 €',
          'Plus de 200 €',
          'Sans limite particulière'
        ),
        false),

      (s.id, 8, 'Qu''est-ce qu''il DÉTESTE ?', 'single',
        jsonb_build_array(
          'Trop sucré / écœurant',
          'Trop fleuri / mémé',
          'Trop marin / savonneux',
          'Trop animal / cuir lourd',
          'Rien de particulier'
        ),
        true),

      (s.id, 9,  'Email',     'email', NULL, false),
      (s.id, 10, 'Téléphone', 'phone', NULL, false);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- Vérifications (à exécuter ensuite si tu veux confirmer)
-- ---------------------------------------------------------------------

-- SELECT count(*) FROM public.clients_v2;            -- 0
-- SELECT count(*) FROM public.shop_perfumes;         -- 0
-- SELECT shop_id, count(*) FROM public.shop_questions GROUP BY shop_id;
-- SELECT count(*) FROM public.boutique_clients;      -- v1 INTACTE
-- SELECT count(*) FROM public.shop_stock;            -- v1 INTACTE
