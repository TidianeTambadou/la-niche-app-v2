"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { Icon } from "@/components/Icon";
import { useFragrances } from "@/lib/data";
import { useStore, type WishlistEntry } from "@/lib/store";

type Filter = "all" | "liked" | "disliked" | "recent";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "liked", label: "Liked" },
  { id: "disliked", label: "Disliked" },
  { id: "recent", label: "Recent" },
];

export default function WishlistPage() {
  const { wishlist, removeFromWishlist } = useStore();
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
    if (filter === "disliked")
      list = list.filter((w) => w.status === "disliked");
    if (filter === "recent") {
      list = list
        .filter((w) => Date.now() - w.addedAt < 1000 * 60 * 60 * 24 * 14)
        .sort((a, b) => b.addedAt - a.addedAt);
    } else {
      list.sort((a, b) => b.addedAt - a.addedAt);
    }
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
      // Fallback: use fragranceMeta stored at wishlist time (works offline/before catalog loads)
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

  const counts = useMemo(
    () => ({
      all: wishlist.length,
      liked: wishlist.filter((w) => w.status === "liked").length,
      disliked: wishlist.filter((w) => w.status === "disliked").length,
      recent: wishlist.filter(
        (w) => Date.now() - w.addedAt < 1000 * 60 * 60 * 24 * 14,
      ).length,
    }),
    [wishlist],
  );

  return (
    <div className="px-6 pt-4 pb-12">
      <header className="mb-10">
        <p className="text-[10px] uppercase tracking-[0.3em] text-outline mb-2">
          Archives &amp; aspirations
        </p>
        <h1 className="text-5xl font-medium leading-[0.9] tracking-tighter">
          Ma Wishlist
        </h1>
      </header>

      <div className="flex gap-6 mb-8 overflow-x-auto hide-scrollbar border-b border-outline-variant/40 pb-3">
        {FILTERS.map((f) => {
          const active = f.id === filter;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={clsx(
                "flex flex-col items-start group transition-opacity",
                active ? "opacity-100" : "opacity-40 hover:opacity-100",
              )}
            >
              <span className="text-xs font-bold tracking-[0.2em] uppercase mb-1">
                {f.label}
              </span>
              <span className="text-[10px] font-mono text-outline">
                {String(counts[f.id]).padStart(2, "0")} UNITS
              </span>
              <div
                className={clsx(
                  "h-0.5 mt-2 bg-primary transition-all",
                  active ? "w-full" : "w-0",
                )}
              />
            </button>
          );
        })}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center text-center py-20">
          <Icon name="favorite_border" size={42} className="text-outline mb-4" />
          <p className="text-sm text-on-surface-variant max-w-xs mb-6">
            Aucun parfum {filter !== "all" ? `(filtre : ${filter})` : ""}{" "}
            pour le moment. Ajoute des parfums depuis Search, Scan ou pendant
            une balade.
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
                {/* Image */}
                <div className="block w-24 aspect-[3/4] bg-surface-container-low overflow-hidden flex-shrink-0">
                  {href ? (
                    <Link href={href} className="block w-full h-full">
                      {imageUrl && (
                        <img src={imageUrl} alt={name} className="w-full h-full object-cover grayscale" />
                      )}
                    </Link>
                  ) : imageUrl ? (
                    <img src={imageUrl} alt={name} className="w-full h-full object-cover grayscale" />
                  ) : null}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-outline">
                    {brand}
                  </p>
                  {href ? (
                    <Link href={href}>
                      <h3 className="text-base font-semibold tracking-tight">{name}</h3>
                    </Link>
                  ) : (
                    <h3 className="text-base font-semibold tracking-tight">{name}</h3>
                  )}

                  <div className="mt-2 flex items-center gap-2">
                    <span
                      className={clsx(
                        "text-[9px] px-2 py-0.5 rounded-full uppercase font-bold tracking-widest",
                        entry.status === "liked"
                          ? "bg-primary text-on-primary"
                          : "border border-error text-error",
                      )}
                    >
                      {entry.status === "liked" ? "Liked" : "Disliked"}
                    </span>
                    <span className="text-[9px] uppercase tracking-widest text-outline">
                      via {entry.origin}
                    </span>
                  </div>

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
