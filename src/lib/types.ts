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

export type StockItem = {
  id: string;
  shop_id: string;
  perfume_name: string;
  brand: string;
  price: number | null;
  quantity: number;
  is_private_sale: boolean;
  private_sale_price: number | null;
  sale_quantity: number | null;
  private_sale_enabled_at: string | null;
  image_url: string | null;
  created_at: string;
  /** Olfactive pyramid + family — auto-enriched by /api/boutique/stock when
   *  the boutique imports a perfume. Empty arrays / null when enrichment
   *  hasn't run yet (e.g. legacy rows or perfume not in Fragella). */
  notes_top: string[];
  notes_heart: string[];
  notes_base: string[];
  family: string | null;
};
