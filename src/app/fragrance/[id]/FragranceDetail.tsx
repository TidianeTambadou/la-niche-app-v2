"use client";

import { useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { Icon } from "@/components/Icon";
import { AddToBaladeSheet } from "@/components/AddToBaladeSheet";
import { useStore } from "@/lib/store";
import {
  useData,
  useFragrance,
  useShops,
  type Availability,
} from "@/lib/data";

const LAYER_LABEL: Record<"top" | "heart" | "base", string> = {
  top: "Notes de tête",
  heart: "Notes de cœur",
  base: "Notes de fond",
};

const LAYER_TIMING: Record<"top" | "heart" | "base", string> = {
  top: "Évaporation rapide · T+0 → T+15min",
  heart: "Évaporation modérée · T+30min → T+4h",
  base: "Évaporation lente · T+6h → T+24h",
};

export function FragranceDetail({ fragranceKey }: { fragranceKey: string }) {
  const { loading, error } = useData();
  const fragrance = useFragrance(fragranceKey);
  const shops = useShops();
  const { isWishlisted, addToWishlist, removeFromWishlist } = useStore();
  const [showBalade, setShowBalade] = useState(false);

  if (loading && !fragrance) {
    return (
      <div className="px-6 pt-12 text-center">
        <p className="text-xs text-outline uppercase tracking-widest">
          Chargement…
        </p>
      </div>
    );
  }

  if (!fragrance) {
    return (
      <div className="px-6 pt-12 text-center">
        <p className="text-sm text-on-surface-variant mb-6">
          {error
            ? `Impossible de charger : ${error}`
            : "Parfum introuvable. Il n'est peut-être plus en stock."}
        </p>
        <Link
          href="/search"
          className="text-[10px] uppercase tracking-widest font-bold border-b border-primary pb-0.5"
        >
          Retour au catalogue
        </Link>
      </div>
    );
  }

  const status = isWishlisted(fragrance.key);
  const grouped = {
    top: (fragrance.notes ?? []).filter((n) => n.layer === "top"),
    heart: (fragrance.notes ?? []).filter((n) => n.layer === "heart"),
    base: (fragrance.notes ?? []).filter((n) => n.layer === "base"),
  };
  const hasNotes = (fragrance.notes ?? []).length > 0;

  return (
    <div className="pb-12">
      {/* Hero image */}
      <section className="px-6 mb-12">
        <div className="relative aspect-[4/5] bg-surface-container-low overflow-hidden">
          {fragrance.imageUrl && (
            <img
              src={fragrance.imageUrl}
              alt={fragrance.name}
              className="w-full h-full object-cover grayscale contrast-110"
            />
          )}
          <div className="absolute top-3 right-3 flex flex-col gap-1 items-end">
            <span className="text-[10px] font-mono uppercase tracking-widest bg-background/80 px-2 py-1">
              Réf. {fragrance.reference}
            </span>
            {fragrance.concentration && (
              <span className="text-[10px] font-mono uppercase tracking-widest bg-background/80 px-2 py-1">
                {fragrance.concentration}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Header */}
      <section className="px-6 mb-10">
        <p className="text-[10px] uppercase font-bold tracking-widest text-outline mb-2">
          {fragrance.brand}
        </p>
        <h1 className="text-5xl font-bold tracking-tighter leading-none mb-4">
          {fragrance.name}.
        </h1>
        {fragrance.description && (
          <p className="text-sm text-on-surface-variant leading-relaxed mb-6 max-w-md">
            {fragrance.description}
          </p>
        )}
        <div className="flex flex-col gap-3">
          {fragrance.volumeMl && (
            <DetailRow label="Format" value={`${fragrance.volumeMl}ml`} />
          )}
          {fragrance.origin && (
            <DetailRow label="Origine" value={fragrance.origin.toUpperCase()} />
          )}
          {fragrance.family && (
            <DetailRow label="Famille" value={fragrance.family} />
          )}
          {fragrance.intensity && (
            <DetailRow label="Intensité" value={fragrance.intensity} />
          )}
          {fragrance.bestPrice != null && (
            <DetailRow
              label="Meilleur prix"
              value={`${fragrance.bestPrice.toFixed(2)} €`}
            />
          )}
        </div>
      </section>

      {/* Actions */}
      <section className="px-6 mb-12 flex flex-col gap-3">
        <button
          type="button"
          onClick={() =>
            status
              ? removeFromWishlist(fragrance.key)
              : addToWishlist(fragrance.key, "liked", "manual")
          }
          className={clsx(
            "w-full py-4 rounded-full text-xs uppercase tracking-[0.2em] font-bold transition-all active:scale-95 flex items-center justify-center gap-2",
            status
              ? "bg-primary text-on-primary"
              : "border border-outline-variant hover:border-primary",
          )}
        >
          <Icon name="favorite" filled={status === "liked"} size={16} />
          {status ? "Retirer de la wishlist" : "Ajouter à la wishlist"}
        </button>
        <button
          type="button"
          onClick={() => setShowBalade(true)}
          className="w-full py-4 border border-outline-variant rounded-full text-xs uppercase tracking-[0.2em] font-bold hover:border-primary transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          <Icon name="directions_walk" size={16} />
          Ajouter à une balade
        </button>
      </section>

      {/* Availability across shops (real data from CRM) */}
      {fragrance.availability.length > 0 && (
        <section className="px-6 mb-12">
          <div className="flex items-center gap-3 mb-8">
            <span className="text-primary font-mono text-sm">01</span>
            <div className="h-px flex-1 bg-outline-variant" />
            <h2 className="text-[10px] uppercase font-bold tracking-widest">
              Disponibilité
            </h2>
          </div>
          <ul className="space-y-px bg-outline-variant/40">
            {fragrance.availability.map((a) => (
              <AvailabilityRow
                key={a.shopId}
                availability={a}
                shopName={
                  shops.find((s) => s.id === a.shopId)?.name ?? "Boutique"
                }
              />
            ))}
          </ul>
        </section>
      )}

      {/* Notes architecture (only if enriched) */}
      {hasNotes && (
        <section className="px-6 mb-12">
          <div className="flex items-center gap-3 mb-8">
            <span className="text-primary font-mono text-sm">02</span>
            <div className="h-px flex-1 bg-outline-variant" />
            <h2 className="text-[10px] uppercase font-bold tracking-widest">
              Architecture olfactive
            </h2>
          </div>
          <div className="space-y-px bg-outline-variant/40">
            {(["top", "heart", "base"] as const).map((layer) => (
              <div
                key={layer}
                className="bg-background p-6 hover:bg-surface-container-low transition-colors"
              >
                <span className="text-[10px] font-mono block mb-2 text-outline uppercase">
                  {LAYER_TIMING[layer]}
                </span>
                <h3 className="text-2xl font-bold tracking-tighter mb-4">
                  {LAYER_LABEL[layer]}
                </h3>
                <ul className="space-y-3">
                  {grouped[layer].map((n) => (
                    <li key={n.name} className="flex items-center gap-3">
                      <div
                        className={clsx(
                          "w-2",
                          layer === "top" &&
                            "h-2 rounded-full border border-primary",
                          layer === "heart" && "h-2 bg-primary",
                          layer === "base" && "h-4 bg-primary rounded-sm",
                        )}
                      />
                      <span className="text-[12px] uppercase font-bold tracking-widest">
                        {n.name}
                      </span>
                    </li>
                  ))}
                  {grouped[layer].length === 0 && (
                    <li className="text-xs text-outline italic">
                      Non documenté.
                    </li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Tags */}
      {(fragrance.tags ?? []).length > 0 && (
        <section className="px-6">
          <h2 className="text-[10px] uppercase font-bold tracking-widest mb-3">
            Marqueurs
          </h2>
          <div className="flex flex-wrap gap-2">
            {fragrance.tags.map((t) => (
              <span
                key={t}
                className="px-3 py-1 bg-surface-container-high rounded-full text-[9px] uppercase tracking-widest"
              >
                {t}
              </span>
            ))}
          </div>
        </section>
      )}

      <AddToBaladeSheet
        fragrance={fragrance}
        open={showBalade}
        onClose={() => setShowBalade(false)}
      />
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-end justify-between border-b border-outline-variant pb-2">
      <span className="text-[10px] uppercase font-bold tracking-widest">
        {label}
      </span>
      <span className="font-mono text-sm">{value}</span>
    </div>
  );
}

function AvailabilityRow({
  availability,
  shopName,
}: {
  availability: Availability;
  shopName: string;
}) {
  const effectivePrice =
    availability.isPrivateSale && availability.privateSalePrice != null
      ? availability.privateSalePrice
      : availability.price;
  return (
    <li className="bg-background p-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{shopName}</p>
        <p className="text-[10px] uppercase tracking-widest text-outline mt-0.5">
          {availability.quantity} en stock
          {availability.isPrivateSale ? " · Vente privée" : ""}
        </p>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="font-mono text-sm">
          {effectivePrice != null
            ? `${effectivePrice.toFixed(2)} €`
            : "—"}
        </span>
        <Link
          href={`/balade/guided/${availability.shopId}`}
          className="text-[10px] uppercase tracking-widest font-bold border-b border-primary pb-0.5"
        >
          Balade
        </Link>
      </div>
    </li>
  );
}
