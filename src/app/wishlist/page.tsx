"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { Icon } from "@/components/Icon";
import { FragranceImage } from "@/components/FragranceImage";
import { useFragrances } from "@/lib/data";
import {
  useStore,
  WISHLIST_CATEGORY_LABELS,
  WISHLIST_CATEGORY_ORDER,
  type WishlistCategory,
  type WishlistEntry,
} from "@/lib/store";

type Filter =
  | "all"
  | "liked"
  | "disliked"
  | "recent"
  | "uncategorized"
  | WishlistCategory;

const STATUS_FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Tous" },
  { id: "liked", label: "Aimés" },
  { id: "disliked", label: "Rejetés" },
  { id: "recent", label: "Récents" },
];

const CATEGORY_FILTERS: { id: Filter; label: string }[] = [
  ...WISHLIST_CATEGORY_ORDER.map((c) => ({
    id: c as Filter,
    label: WISHLIST_CATEGORY_LABELS[c],
  })),
  { id: "uncategorized", label: "Sans rangement" },
];

export default function WishlistPage() {
  const { wishlist, removeFromWishlist, setWishlistCategory } = useStore();
  const fragrances = useFragrances();
  const [filter, setFilter] = useState<Filter>("all");

  type DisplayItem = {
    entry: WishlistEntry;
    name: string;
    brand: string;
    imageUrl: string | null;
    href: string | null;
  };

  const items = useMemo<DisplayItem[]>(() => {
    let list = [...wishlist];
    if (filter === "liked") list = list.filter((w) => w.status === "liked");
    else if (filter === "disliked")
      list = list.filter((w) => w.status === "disliked");
    else if (filter === "uncategorized")
      list = list.filter((w) => !w.category);
    else if (filter === "recent") {
      list = list
        .filter((w) => Date.now() - w.addedAt < 1000 * 60 * 60 * 24 * 14)
        .sort((a, b) => b.addedAt - a.addedAt);
    } else if (filter !== "all") {
      // category filter
      list = list.filter((w) => w.category === filter);
    }
    if (filter !== "recent") list.sort((a, b) => b.addedAt - a.addedAt);
    return list.flatMap((w): DisplayItem[] => {
      const fragrance = fragrances.find((f) => f.key === w.fragranceId);
      if (fragrance) {
        return [{
          entry: w,
          name: fragrance.name,
          brand: fragrance.brand,
          imageUrl: fragrance.imageUrl,
          href: `/fragrance/${fragrance.key}`,
        }];
      }
      if (w.fragranceMeta) {
        return [{
          entry: w,
          name: w.fragranceMeta.name,
          brand: w.fragranceMeta.brand,
          imageUrl: w.fragranceMeta.imageUrl ?? null,
          href: null,
        }];
      }
      return [];
    });
  }, [wishlist, filter, fragrances]);

  const counts = useMemo(() => {
    const base: Record<string, number> = {
      all: wishlist.length,
      liked: wishlist.filter((w) => w.status === "liked").length,
      disliked: wishlist.filter((w) => w.status === "disliked").length,
      recent: wishlist.filter(
        (w) => Date.now() - w.addedAt < 1000 * 60 * 60 * 24 * 14,
      ).length,
      uncategorized: wishlist.filter((w) => !w.category).length,
    };
    for (const c of WISHLIST_CATEGORY_ORDER) {
      base[c] = wishlist.filter((w) => w.category === c).length;
    }
    return base;
  }, [wishlist]);

  return (
    <div className="px-6 pt-4 pb-12">
      <header className="mb-8">
        <p className="text-[10px] uppercase tracking-[0.3em] text-outline mb-2">
          Archives &amp; aspirations
        </p>
        <h1 className="text-5xl font-medium leading-[0.9] tracking-tighter">
          Ma Wishlist
        </h1>
      </header>

      <FilterRow
        title="Vue"
        filters={STATUS_FILTERS}
        active={filter}
        counts={counts}
        onPick={setFilter}
      />

      <FilterRow
        title="Mes catégories"
        filters={CATEGORY_FILTERS}
        active={filter}
        counts={counts}
        onPick={setFilter}
      />

      {items.length === 0 ? (
        <div className="flex flex-col items-center text-center py-20">
          <Icon name="favorite_border" size={42} className="text-outline mb-4" />
          <p className="text-sm text-on-surface-variant max-w-xs mb-6">
            Aucun parfum
            {filter !== "all" ? ` (filtre : ${labelFor(filter)})` : ""} pour
            le moment. Ajoute des parfums depuis Search, Scan ou pendant une
            balade.
          </p>
          <Link
            href="/search"
            className="px-6 py-3 bg-primary text-on-primary rounded-full text-[10px] uppercase tracking-widest font-bold active:scale-95 transition-transform"
          >
            Explorer
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col">
          {items.map(({ entry, name, brand, imageUrl, href }) => (
            <li
              key={entry.fragranceId}
              className="border-b border-outline-variant/30 last:border-0"
            >
              <div className="flex items-start gap-4 py-5">
                <div className="block w-24 aspect-[3/4] bg-surface-container-low overflow-hidden flex-shrink-0">
                  {href ? (
                    <Link href={href} className="block w-full h-full">
                      <FragranceImage
                        src={imageUrl}
                        name={name}
                        brand={brand}
                        fallbackSize="md"
                        className="w-full h-full grayscale"
                      />
                    </Link>
                  ) : (
                    <FragranceImage
                      src={imageUrl}
                      name={name}
                      brand={brand}
                      fallbackSize="md"
                      className="w-full h-full grayscale"
                    />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-outline">
                    {brand}
                  </p>
                  {href ? (
                    <Link href={href}>
                      <h3 className="text-base font-semibold tracking-tight">
                        {name}
                      </h3>
                    </Link>
                  ) : (
                    <h3 className="text-base font-semibold tracking-tight">
                      {name}
                    </h3>
                  )}

                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <span
                      className={clsx(
                        "text-[9px] px-2 py-0.5 rounded-full uppercase font-bold tracking-widest",
                        entry.status === "liked"
                          ? "bg-primary text-on-primary"
                          : "border border-error text-error",
                      )}
                    >
                      {entry.status === "liked" ? "Aimé" : "Rejeté"}
                    </span>
                    <span className="text-[9px] uppercase tracking-widest text-outline">
                      via {entry.origin}
                    </span>
                    {entry.category && (
                      <span className="text-[9px] px-2 py-0.5 rounded-full uppercase font-bold tracking-widest bg-surface-container-high text-on-background">
                        {WISHLIST_CATEGORY_LABELS[entry.category]}
                      </span>
                    )}
                  </div>

                  <CategorySelector
                    value={entry.category ?? null}
                    onChange={(cat) =>
                      setWishlistCategory(entry.fragranceId, cat)
                    }
                  />

                  <div className="mt-3 flex items-center gap-3">
                    <Link
                      href="/balade"
                      className="text-[10px] uppercase tracking-widest font-bold border-b border-primary pb-0.5"
                    >
                      Balade
                    </Link>
                    <button
                      type="button"
                      onClick={() => removeFromWishlist(entry.fragranceId)}
                      className="text-[10px] uppercase tracking-widest font-bold text-outline hover:text-error transition-colors flex items-center gap-1"
                    >
                      <Icon name="delete_outline" size={14} />
                      Retirer
                    </button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterRow({
  title,
  filters,
  active,
  counts,
  onPick,
}: {
  title: string;
  filters: { id: Filter; label: string }[];
  active: Filter;
  counts: Record<string, number>;
  onPick: (f: Filter) => void;
}) {
  return (
    <div className="mb-6">
      <p className="text-[9px] uppercase tracking-[0.25em] font-bold text-outline mb-2">
        {title}
      </p>
      <div className="flex gap-2 overflow-x-auto hide-scrollbar -mx-6 px-6 pb-2">
        {filters.map((f) => {
          const isActive = active === f.id;
          const n = counts[f.id] ?? 0;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => onPick(f.id)}
              className={clsx(
                "flex-shrink-0 px-3 py-1.5 border text-[10px] uppercase tracking-widest font-bold transition-all",
                isActive
                  ? "bg-primary text-on-primary border-primary"
                  : "border-outline-variant hover:border-primary text-on-background",
              )}
            >
              {f.label}
              <span
                className={clsx(
                  "ml-1.5 font-mono",
                  isActive ? "text-on-primary/80" : "text-outline",
                )}
              >
                {String(n).padStart(2, "0")}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CategorySelector({
  value,
  onChange,
}: {
  value: WishlistCategory | null;
  onChange: (cat: WishlistCategory | null) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {WISHLIST_CATEGORY_ORDER.map((c) => {
        const picked = value === c;
        return (
          <button
            key={c}
            type="button"
            onClick={() => onChange(picked ? null : c)}
            className={clsx(
              "text-[9px] px-2 py-0.5 border uppercase tracking-widest font-bold transition-all",
              picked
                ? "bg-on-background text-background border-on-background"
                : "border-outline-variant/60 text-outline hover:border-primary hover:text-on-background",
            )}
            aria-pressed={picked}
          >
            {WISHLIST_CATEGORY_LABELS[c]}
          </button>
        );
      })}
    </div>
  );
}

function labelFor(f: Filter): string {
  if (f === "all") return "Tous";
  if (f === "liked") return "Aimés";
  if (f === "disliked") return "Rejetés";
  if (f === "recent") return "Récents";
  if (f === "uncategorized") return "Sans rangement";
  return WISHLIST_CATEGORY_LABELS[f];
}
