"use client";

import Link from "next/link";
import { useState } from "react";
import { clsx } from "clsx";
import type { Fragrance } from "@/lib/fragrances";
import { useStore } from "@/lib/store";
import { Icon } from "@/components/Icon";
import { AddToBaladeSheet } from "@/components/AddToBaladeSheet";

type Variant = "list" | "feature" | "compact";

type Props = {
  fragrance: Fragrance;
  variant?: Variant;
  /** Optional match score badge (0..1) — shown on Search results. */
  matchScore?: number;
  /** Source for wishlist origin tagging. */
  origin?: "search" | "scan" | "balade" | "manual";
};

export function PerfumeCard({
  fragrance,
  variant = "list",
  matchScore,
  origin = "manual",
}: Props) {
  const { isWishlisted, addToWishlist, removeFromWishlist } = useStore();
  const [showBalade, setShowBalade] = useState(false);
  const status = isWishlisted(fragrance.id);

  function toggleWishlist(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (status) removeFromWishlist(fragrance.id);
    else addToWishlist(fragrance.id, "liked", origin);
  }

  function openBaladeSheet(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setShowBalade(true);
  }

  if (variant === "compact") {
    return (
      <>
        <Link
          href={`/fragrance/${fragrance.key}`}
          className="group block min-w-[180px] flex-shrink-0"
        >
          <div className="relative aspect-[3/4] bg-surface-container-low overflow-hidden">
            {fragrance.imageUrl && (
              <img
                src={fragrance.imageUrl}
                alt={fragrance.name}
                className="w-full h-full object-cover grayscale contrast-110 group-hover:grayscale-0 transition-all duration-700"
              />
            )}
            <div className="absolute top-2 left-2">
              <span className="text-[9px] uppercase tracking-widest font-mono bg-background/90 px-2 py-0.5 border border-outline-variant">
                {fragrance.reference}
              </span>
            </div>
          </div>
          <div className="mt-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-outline">
              {fragrance.brand}
            </p>
            <h3 className="text-sm font-medium tracking-tight">
              {fragrance.name}
            </h3>
          </div>
        </Link>
        <AddToBaladeSheet
          fragrance={fragrance}
          open={showBalade}
          onClose={() => setShowBalade(false)}
        />
      </>
    );
  }

  if (variant === "feature") {
    return (
      <>
        <article className="bg-surface-container-lowest border border-outline-variant/40">
          <Link href={`/fragrance/${fragrance.id}`} className="block">
            <div className="relative aspect-[4/5] bg-surface-container-low overflow-hidden">
              {fragrance.imageUrl && (
                <img
                  src={fragrance.imageUrl}
                  alt={fragrance.name}
                  className="w-full h-full object-cover grayscale contrast-110 hover:scale-105 transition-transform duration-700"
                />
              )}
              <div className="absolute top-3 left-3">
                <span className="text-[10px] uppercase tracking-widest font-mono bg-background/90 px-2 py-1 border border-outline-variant">
                  REF: {fragrance.reference}
                </span>
              </div>
              {typeof matchScore === "number" && (
                <div className="absolute top-3 right-3">
                  <span className="text-[10px] font-mono bg-background/90 px-2 py-1 border border-outline-variant">
                    MATCH {Math.round(matchScore * 100)}%
                  </span>
                </div>
              )}
            </div>
          </Link>
          <div className="p-5">
            <p className="text-[10px] uppercase tracking-[0.2em] text-outline mb-1">
              {fragrance.brand}
            </p>
            <h3 className="text-2xl font-semibold tracking-tight mb-3">
              {fragrance.name}
            </h3>
            <div className="grid grid-cols-2 gap-y-3 mb-5 border-t border-outline-variant/40 pt-4">
              <Field label="Famille" value={fragrance.family ?? "—"} />
              <Field label="Origine" value={fragrance.origin ?? "—"} />
              <Field
                label="Concentration"
                value={fragrance.concentration ?? "—"}
              />
              <Field
                label={fragrance.bestPrice != null ? "Prix" : "Volume"}
                value={
                  fragrance.bestPrice != null
                    ? `${fragrance.bestPrice.toFixed(2)} €`
                    : fragrance.volumeMl
                      ? `${fragrance.volumeMl}ml`
                      : "—"
                }
                mono
              />
            </div>
            <CardActions
              status={status}
              onWishlist={toggleWishlist}
              onBalade={openBaladeSheet}
              fragranceId={fragrance.id}
            />
          </div>
        </article>
        <AddToBaladeSheet
          fragrance={fragrance}
          open={showBalade}
          onClose={() => setShowBalade(false)}
        />
      </>
    );
  }

  // list variant — default
  return (
    <>
      <article className="grid grid-cols-12 gap-4 items-start py-6 border-b border-outline-variant/30 last:border-0">
        <Link
          href={`/fragrance/${fragrance.key}`}
          className="col-span-5 group block"
        >
          <div className="relative aspect-[3/4] bg-surface-container-low overflow-hidden">
            {fragrance.imageUrl && (
              <img
                src={fragrance.imageUrl}
                alt={fragrance.name}
                className="w-full h-full object-cover grayscale contrast-110 group-hover:grayscale-0 transition-all duration-700"
              />
            )}
            <div className="absolute top-2 left-2">
              <span className="text-[9px] uppercase tracking-widest font-mono bg-background/90 px-2 py-0.5 border border-outline-variant">
                {fragrance.reference}
              </span>
            </div>
          </div>
        </Link>
        <div className="col-span-7 flex flex-col gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-outline">
              {fragrance.brand}
            </p>
            <Link href={`/fragrance/${fragrance.key}`}>
              <h3 className="text-lg font-semibold tracking-tight leading-tight">
                {fragrance.name}
              </h3>
            </Link>
            <p className="text-[10px] uppercase tracking-[0.15em] text-outline mt-1">
              {[fragrance.family, fragrance.intensity]
                .filter(Boolean)
                .join(" · ") ||
                (fragrance.bestPrice != null
                  ? `${fragrance.bestPrice.toFixed(2)} €`
                  : "—")}
            </p>
          </div>
          {typeof matchScore === "number" && (
            <span className="text-[10px] font-mono text-outline">
              MATCH {Math.round(matchScore * 100)}%
            </span>
          )}
          <CardActions
            status={status}
            onWishlist={toggleWishlist}
            onBalade={openBaladeSheet}
            fragranceId={fragrance.id}
          />
        </div>
      </article>
      <AddToBaladeSheet
        fragrance={fragrance}
        open={showBalade}
        onClose={() => setShowBalade(false)}
      />
    </>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-widest text-outline mb-1">
        {label}
      </p>
      <p className={clsx("text-sm font-medium", mono && "font-mono")}>
        {value}
      </p>
    </div>
  );
}

function CardActions({
  status,
  onWishlist,
  onBalade,
  fragranceId,
}: {
  status: ReturnType<ReturnType<typeof useStore>["isWishlisted"]>;
  onWishlist: (e: React.MouseEvent) => void;
  onBalade: (e: React.MouseEvent) => void;
  fragranceId: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onWishlist}
        className={clsx(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-widest font-bold transition-all active:scale-95",
          status
            ? "bg-primary text-on-primary"
            : "border border-outline-variant hover:border-primary",
        )}
        aria-pressed={Boolean(status)}
      >
        <Icon name="favorite" filled={status === "liked"} size={14} />
        {status ? "Wishlist" : "Wishlist"}
      </button>
      <button
        type="button"
        onClick={onBalade}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-widest font-bold border border-outline-variant hover:border-primary transition-all active:scale-95"
      >
        <Icon name="directions_walk" size={14} />
        Balade
      </button>
      <Link
        href={`/fragrance/${fragranceId}`}
        className="ml-auto text-[10px] uppercase tracking-widest font-bold border-b border-primary pb-0.5"
      >
        Détails
      </Link>
    </div>
  );
}
