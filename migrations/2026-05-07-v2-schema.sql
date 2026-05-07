-- =====================================================================
-- 2026-05-07 — La Niche v2 schema (full reset)
--
-- À lancer une fois dans le SQL Editor Supabase. Idempotent.
--
-- Ce script :
--   1. Drop les tables v1 hors-scope (boutique_clients ancien schéma,
--      shop_stock, référent / quota / abonnement / concours…).
--      `shops` et `auth.*` sont préservés.
--   2. Recrée 4 tables v2 : boutique_clients (nouveau schéma),
--      shop_questions, shop_perfumes, newsletter_campaigns,
--      newsletter_recipients.
--   3. RLS partout, basée sur la convention `shops.id = auth.uid()`.
--   4. Trigger updated_at sur les tables qui en ont besoin.
--   5. Seed un jeu de questions par défaut pour chaque boutique existante.
--
-- ⚠️  Destructif sur les anciennes tables. La branche `legacy-v1`
--     préserve la version d'avant côté code ; côté DB, dump avant si
--     tu veux récupérer l'historique.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Drop des tables v1
-- ---------------------------------------------------------------------

DROP TABLE IF EXISTS public.boutique_clients         CASCADE;
DROP TABLE IF EXISTS public.shop_stock               CASCADE;
DROP TABLE IF EXISTS public.boutique_referrals       CASCADE;
DROP TABLE IF EXISTS public.referral_codes           CASCADE;
DROP TABLE IF EXISTS public.referral_redemptions     CASCADE;
DROP TABLE IF EXISTS public.usage_log                CASCADE;
DROP TABLE IF EXISTS public.subscription_state       CASCADE;
DROP TABLE IF EXISTS public.search_quota             CASCADE;
DROP TABLE IF EXISTS public.monthly_winners          CASCADE;
DROP TABLE IF EXISTS public.contest_entries          CASCADE;
DROP TABLE IF EXISTS public.user_quotas              CASCADE;

-- ---------------------------------------------------------------------
-- 1. Trigger générique updated_at (réutilisable)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------
-- 2. boutique_clients — fiche client v2
-- ---------------------------------------------------------------------

CREATE TABLE public.boutique_clients (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id            uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  -- Quand source = 'user_account', user_id pointe vers auth.users.
  user_id            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source             text NOT NULL CHECK (source IN ('in_shop', 'user_account')),
  first_name         text NOT NULL,
  last_name          text NOT NULL,
  email              text,
  phone              text,
  preferred_channel  text NOT NULL DEFAULT 'email'
                     CHECK (preferred_channel IN ('email', 'sms', 'both')),
  consent_marketing  boolean NOT NULL DEFAULT false,
  consent_at         timestamptz,
  -- Réponses brutes au questionnaire (id question → string | string[] | nombre)
  quiz_answers       jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Profil olfactif extrait par l'IA (familles, accords, notes aimées/avitées…)
  olfactive_profile  jsonb,
  -- Rapport long format rendu pour la boutique
  report             jsonb,
  -- Notes libres éditables par la boutique après-coup
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  -- Au moins un canal renseigné si on veut envoyer une newsletter.
  CONSTRAINT clients_has_contact CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE INDEX idx_boutique_clients_shop_created
  ON public.boutique_clients (shop_id, created_at DESC);

CREATE INDEX idx_boutique_clients_shop_source
  ON public.boutique_clients (shop_id, source);

CREATE INDEX idx_boutique_clients_search
  ON public.boutique_clients
  USING gin (
    to_tsvector('french',
      coalesce(first_name, '') || ' ' || coalesce(last_name, '') || ' ' || coalesce(email, ''))
  );

CREATE TRIGGER trg_boutique_clients_updated_at
  BEFORE UPDATE ON public.boutique_clients
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.boutique_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shop_owner_reads_clients"
  ON public.boutique_clients FOR SELECT TO authenticated
  USING (shop_id = auth.uid());

CREATE POLICY "shop_owner_writes_clients"
  ON public.boutique_clients FOR INSERT TO authenticated
  WITH CHECK (shop_id = auth.uid());

CREATE POLICY "shop_owner_updates_clients"
  ON public.boutique_clients FOR UPDATE TO authenticated
  USING (shop_id = auth.uid())
  WITH CHECK (shop_id = auth.uid());

CREATE POLICY "shop_owner_deletes_clients"
  ON public.boutique_clients FOR DELETE TO authenticated
  USING (shop_id = auth.uid());

-- Le user qui a rempli son propre formulaire peut relire sa fiche.
CREATE POLICY "user_reads_own_client_card"
  ON public.boutique_clients FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 3. shop_questions — questionnaire dynamique de la boutique
-- ---------------------------------------------------------------------

CREATE TABLE public.shop_questions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id     uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  position    integer NOT NULL,
  label       text NOT NULL,
  kind        text NOT NULL
              CHECK (kind IN ('text', 'single', 'multi', 'scale', 'email', 'phone')),
  options     jsonb,         -- choices array, scale config, etc.
  required    boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (shop_id, position)
);

CREATE INDEX idx_shop_questions_shop_position
  ON public.shop_questions (shop_id, position);

CREATE TRIGGER trg_shop_questions_updated_at
  BEFORE UPDATE ON public.shop_questions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.shop_questions ENABLE ROW LEVEL SECURITY;

-- Lecture publique : nécessaire pour le formulaire user-side.
CREATE POLICY "shop_questions_public_read"
  ON public.shop_questions FOR SELECT TO authenticated, anon
  USING (true);

CREATE POLICY "shop_owner_writes_questions"
  ON public.shop_questions FOR INSERT TO authenticated
  WITH CHECK (shop_id = auth.uid());

CREATE POLICY "shop_owner_updates_questions"
  ON public.shop_questions FOR UPDATE TO authenticated
  USING (shop_id = auth.uid())
  WITH CHECK (shop_id = auth.uid());

CREATE POLICY "shop_owner_deletes_questions"
  ON public.shop_questions FOR DELETE TO authenticated
  USING (shop_id = auth.uid());

-- ---------------------------------------------------------------------
-- 4. shop_perfumes — stock parfums boutique (v2, propre)
-- ---------------------------------------------------------------------

CREATE TABLE public.shop_perfumes (
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
  updated_at   timestamptz NOT NULL DEFAULT now(),

  UNIQUE (shop_id, lower(brand), lower(name))
);

CREATE INDEX idx_shop_perfumes_shop ON public.shop_perfumes (shop_id);
CREATE INDEX idx_shop_perfumes_in_stock ON public.shop_perfumes (shop_id, in_stock);

CREATE TRIGGER trg_shop_perfumes_updated_at
  BEFORE UPDATE ON public.shop_perfumes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.shop_perfumes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shop_perfumes_public_read"
  ON public.shop_perfumes FOR SELECT TO authenticated, anon
  USING (true);

CREATE POLICY "shop_owner_writes_perfumes"
  ON public.shop_perfumes FOR INSERT TO authenticated
  WITH CHECK (shop_id = auth.uid());

CREATE POLICY "shop_owner_updates_perfumes"
  ON public.shop_perfumes FOR UPDATE TO authenticated
  USING (shop_id = auth.uid())
  WITH CHECK (shop_id = auth.uid());

CREATE POLICY "shop_owner_deletes_perfumes"
  ON public.shop_perfumes FOR DELETE TO authenticated
  USING (shop_id = auth.uid());

-- ---------------------------------------------------------------------
-- 5. newsletter_campaigns + newsletter_recipients
-- ---------------------------------------------------------------------

CREATE TABLE public.newsletter_campaigns (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id       uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  perfume_id    uuid NOT NULL REFERENCES public.shop_perfumes(id) ON DELETE CASCADE,
  target_count  integer NOT NULL CHECK (target_count > 0),
  status        text NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'sending', 'sent', 'failed')),
  -- Snapshot du panel sélectionné par l'IA : [{client_id, score, reason}]
  preview       jsonb,
  subject       text,
  body_md       text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  sent_at       timestamptz
);

CREATE INDEX idx_campaigns_shop ON public.newsletter_campaigns (shop_id, created_at DESC);

ALTER TABLE public.newsletter_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shop_owner_reads_campaigns"
  ON public.newsletter_campaigns FOR SELECT TO authenticated
  USING (shop_id = auth.uid());

CREATE POLICY "shop_owner_writes_campaigns"
  ON public.newsletter_campaigns FOR INSERT TO authenticated
  WITH CHECK (shop_id = auth.uid());

CREATE POLICY "shop_owner_updates_campaigns"
  ON public.newsletter_campaigns FOR UPDATE TO authenticated
  USING (shop_id = auth.uid())
  WITH CHECK (shop_id = auth.uid());

CREATE TABLE public.newsletter_recipients (
  campaign_id  uuid NOT NULL REFERENCES public.newsletter_campaigns(id) ON DELETE CASCADE,
  client_id    uuid NOT NULL REFERENCES public.boutique_clients(id) ON DELETE CASCADE,
  score        numeric(6, 4) NOT NULL,
  channel      text NOT NULL CHECK (channel IN ('email', 'sms')),
  status       text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  error        text,
  sent_at      timestamptz,
  PRIMARY KEY (campaign_id, client_id)
);

CREATE INDEX idx_recipients_campaign ON public.newsletter_recipients (campaign_id);
CREATE INDEX idx_recipients_status ON public.newsletter_recipients (status, campaign_id);

ALTER TABLE public.newsletter_recipients ENABLE ROW LEVEL SECURITY;

-- La RLS s'appuie sur le shop_id de la campagne parente.
CREATE POLICY "shop_owner_reads_recipients"
  ON public.newsletter_recipients FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.newsletter_campaigns c
      WHERE c.id = newsletter_recipients.campaign_id
        AND c.shop_id = auth.uid()
    )
  );

CREATE POLICY "shop_owner_writes_recipients"
  ON public.newsletter_recipients FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.newsletter_campaigns c
      WHERE c.id = newsletter_recipients.campaign_id
        AND c.shop_id = auth.uid()
    )
  );

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
-- 6. Seed : questionnaire par défaut pour chaque boutique existante
--    Permet d'avoir un formulaire fonctionnel out-of-the-box. La
--    boutique pourra réordonner/éditer/supprimer dans Settings.
-- ---------------------------------------------------------------------

DO $$
DECLARE
  s record;
BEGIN
  FOR s IN SELECT id FROM public.shops LOOP
    -- Skip si la boutique a déjà des questions (idempotent).
    IF EXISTS (SELECT 1 FROM public.shop_questions WHERE shop_id = s.id) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.shop_questions (shop_id, position, label, kind, options, required) VALUES
      (s.id, 1, 'Quel parfum portez-vous habituellement ?', 'text', NULL, false),
      (s.id, 2, 'Quelles familles olfactives vous attirent ?', 'multi',
        jsonb_build_array(
          'Floral', 'Boisé', 'Oriental', 'Fruité', 'Gourmand',
          'Hespéridé', 'Fougère', 'Chypré', 'Aromatique', 'Cuir'
        ),
        true),
      (s.id, 3, 'Préférez-vous un sillage discret ou enveloppant ?', 'scale',
        jsonb_build_object('min', 1, 'max', 5, 'minLabel', 'Discret', 'maxLabel', 'Enveloppant'),
        true),
      (s.id, 4, 'Pour quelle occasion ?', 'single',
        jsonb_build_array('Jour', 'Travail', 'Soir / sortie', 'Vacances', 'Tous les jours'),
        true),
      (s.id, 5, 'Quelles notes adorez-vous ?', 'text', NULL, false),
      (s.id, 6, 'Quelles notes détestez-vous ?', 'text', NULL, false),
      (s.id, 7, 'Email', 'email', NULL, false),
      (s.id, 8, 'Téléphone', 'phone', NULL, false);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- Vérifications
-- ---------------------------------------------------------------------

-- SELECT count(*) FROM public.shops;
-- SELECT shop_id, count(*) FROM public.shop_questions GROUP BY shop_id;
-- SELECT count(*) FROM public.boutique_clients;     -- 0
-- SELECT count(*) FROM public.shop_perfumes;        -- 0
-- SELECT count(*) FROM public.newsletter_campaigns; -- 0
