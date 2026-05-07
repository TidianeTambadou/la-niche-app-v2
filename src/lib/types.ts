/**
 * Shared DB shapes — narrow mirror of the Supabase tables actually used by
 * the v2 app. `Shop` keeps the same identity convention as v1
 * (`shops.id = auth.uid()` for boutique accounts).
 */

export type DayHours = {
  ouvert: boolean;
  debut: string;
  fin: string;
};

export type OpeningHours = {
  lundi: DayHours;
  mardi: DayHours;
  mercredi: DayHours;
  jeudi: DayHours;
  vendredi: DayHours;
  samedi: DayHours;
  dimanche: DayHours;
};

export type Shop = {
  id: string;
  name: string;
  address_line: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  website_url: string | null;
  instagram_url: string | null;
  opening_hours: OpeningHours | null;
  created_at: string;
  updated_at: string | null;
};

/* ─── v2 — questionnaire dynamique ──────────────────────────────────── */

export type QuestionKind = "text" | "single" | "multi" | "scale" | "email" | "phone";

export type ShopQuestion = {
  id: string;
  shop_id: string;
  position: number;
  label: string;
  kind: QuestionKind;
  /** For single/multi : array of choices. For scale : `{ min, max, minLabel, maxLabel }`. Null otherwise. */
  options: unknown | null;
  required: boolean;
  created_at: string;
  updated_at: string;
};

/* ─── v2 — fiche client ─────────────────────────────────────────────── */

export type CommChannel = "email" | "sms" | "both";
export type ClientSource = "in_shop" | "user_account";

export type BoutiqueClient = {
  id: string;
  shop_id: string;
  user_id: string | null;
  source: ClientSource;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  /** Postal address — captured via the BAN API (api-adresse.data.gouv.fr)
   *  so it stays canonical and de-duplicates clients with similar names. */
  address_line: string | null;
  postal_code: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  preferred_channel: CommChannel;
  consent_marketing: boolean;
  consent_at: string | null;
  quiz_answers: Record<string, unknown>;
  /** Olfactive profile generated from the answers (families, accords, notes…). */
  olfactive_profile: Record<string, unknown> | null;
  /** Long-form report rendered for the boutique. */
  report: Record<string, unknown> | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

/* ─── v2 — stock parfums boutique ───────────────────────────────────── */

export type ShopPerfume = {
  id: string;
  shop_id: string;
  name: string;
  brand: string;
  family: string | null;
  top_notes: string[];
  heart_notes: string[];
  base_notes: string[];
  accords: string[];
  description: string | null;
  image_url: string | null;
  price_eur: number | null;
  in_stock: boolean;
  created_at: string;
  updated_at: string;
};

/* ─── v2 — newsletter ───────────────────────────────────────────────── */

export type CampaignStatus = "draft" | "sending" | "sent" | "failed";
export type RecipientStatus = "pending" | "sent" | "failed" | "skipped";

export type NewsletterCampaign = {
  id: string;
  shop_id: string;
  perfume_id: string;
  target_count: number;
  status: CampaignStatus;
  /** Snapshot of the AI-selected panel + scores at preview time. */
  preview: { client_id: string; score: number; reason: string }[] | null;
  subject: string | null;
  body_md: string | null;
  created_at: string;
  sent_at: string | null;
};

export type NewsletterRecipient = {
  campaign_id: string;
  client_id: string;
  score: number;
  channel: "email" | "sms";
  status: RecipientStatus;
  error: string | null;
  sent_at: string | null;
};
