"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { clsx } from "clsx";
import { Icon } from "@/components/Icon";
import {
  BodySilhouette,
  fragranceInitials,
} from "@/components/BodySilhouette";
import {
  BODY_ZONE_LABELS,
  type BodyZone,
} from "@/lib/fragrances";
import { useFragrances } from "@/lib/data";
import { useStore, type FinishedBalade } from "@/lib/store";

export default function EndOfBaladePage() {
  const router = useRouter();
  const fragrances = useFragrances();
  const { activeBalade, history, addToWishlist, endBalade } = useStore();
  const [archived, setArchived] = useState<FinishedBalade | null>(null);

  const balade = activeBalade ?? archived ?? history[0] ?? null;

  useEffect(() => {
    if (!activeBalade && !archived && history.length === 0) {
      router.replace("/balade");
    }
  }, [activeBalade, archived, history.length, router]);

  const filledMarkers = useMemo(() => {
    if (!balade) return [];
    return balade.placements
      .map((p) => {
        const f = fragrances.find((x) => x.key === p.fragranceId);
        if (!f) return null;
        return {
          fragranceId: p.fragranceId,
          zone: p.zone,
          label: fragranceInitials(f.name),
          position: p.position,
        };
      })
      .filter((m): m is NonNullable<typeof m> => Boolean(m));
  }, [balade, fragrances]);

  if (!balade) return null;

  const testedIds = new Set(balade.tested.map((t) => t.fragranceId));
  const extraPlacements = balade.placements.filter(
    (p) => !testedIds.has(p.fragranceId),
  );

  function commit() {
    if (!activeBalade) return;
    endBalade();
    setArchived({ ...activeBalade, finishedAt: Date.now() });
  }

  return (
    <div className="px-6 pt-4 pb-12">
      <header className="mb-6">
        <span className="text-[10px] uppercase tracking-[0.3em] text-outline block mb-2">
          {activeBalade ? "Résumé · à valider" : "Mémoire de balade"}
        </span>
        <h1 className="text-4xl font-bold tracking-tighter leading-none">
          {balade.mode === "free" ? "Balade libre" : "Balade guidée"}
        </h1>
        <p className="text-xs text-on-surface-variant mt-3">
          {balade.tested.length} testé{balade.tested.length > 1 ? "s" : ""} ·{" "}
          {balade.placements.length} pose
          {balade.placements.length > 1 ? "s" : ""}
        </p>
      </header>

      <section className="bg-surface-container-low border border-outline-variant py-6 mb-8">
        <BodySilhouette filledMarkers={filledMarkers} readOnly />
      </section>

      <section className="mb-8">
        <h2 className="text-[10px] uppercase tracking-[0.2em] font-bold mb-3">
          Parfums testés
        </h2>
        {balade.tested.length === 0 && extraPlacements.length === 0 ? (
          <p className="text-xs text-outline italic">Aucun test enregistré.</p>
        ) : (
          <ul className="border-t border-outline-variant/40">
            {balade.tested.map((t) => {
              const f = fragrances.find((x) => x.key === t.fragranceId);
              if (!f) return null;
              const placement = balade.placements.find(
                (p) => p.fragranceId === f.key,
              );
              return (
                <ResultRow
                  key={f.key}
                  fragranceKey={f.key}
                  brand={f.brand}
                  name={f.name}
                  zone={placement?.zone ?? null}
                  feedback={t.feedback}
                  onWishlist={(s) => addToWishlist(f.key, s, "balade")}
                />
              );
            })}
            {extraPlacements.map((p) => {
              const f = fragrances.find((x) => x.key === p.fragranceId);
              if (!f) return null;
              return (
                <ResultRow
                  key={f.key}
                  fragranceKey={f.key}
                  brand={f.brand}
                  name={f.name}
                  zone={p.zone}
                  feedback={null}
                  onWishlist={(s) => addToWishlist(f.key, s, "balade")}
                />
              );
            })}
          </ul>
        )}
      </section>

      {activeBalade ? (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={commit}
            className="w-full py-4 bg-primary text-on-primary rounded-full text-xs uppercase tracking-[0.2em] font-bold active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <Icon name="check" size={16} />
            Archiver cette balade
          </button>
          <button
            type="button"
            onClick={() =>
              router.push(
                balade.mode === "free"
                  ? "/balade/free"
                  : "/balade/guided/active",
              )
            }
            className="w-full py-3 border border-outline-variant rounded-full text-[10px] uppercase tracking-widest font-bold hover:border-primary transition-all"
          >
            Reprendre la balade
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Link
            href="/balade"
            className="w-full py-4 bg-primary text-on-primary rounded-full text-xs uppercase tracking-[0.2em] font-bold text-center active:scale-95 transition-all"
          >
            Nouvelle balade
          </Link>
          <Link
            href="/profile"
            className="w-full py-3 border border-outline-variant rounded-full text-[10px] uppercase tracking-widest font-bold text-center hover:border-primary transition-all"
          >
            Voir l&apos;historique
          </Link>
        </div>
      )}
    </div>
  );
}

function ResultRow({
  fragranceKey,
  brand,
  name,
  zone,
  feedback,
  onWishlist,
}: {
  fragranceKey: string;
  brand: string;
  name: string;
  zone: BodyZone | null;
  feedback: "liked" | "disliked" | null;
  onWishlist: (status: "liked" | "disliked") => void;
}) {
  const { isWishlisted } = useStore();
  const status = isWishlisted(fragranceKey);

  return (
    <li className="py-4 border-b border-outline-variant/40">
      <div className="flex items-start justify-between gap-3">
        <Link
          href={`/fragrance/${fragranceKey}`}
          className="flex items-center gap-3 flex-1 min-w-0"
        >
          <span className="w-9 h-9 bg-primary text-on-primary flex items-center justify-center text-[10px] font-bold font-mono">
            {fragranceInitials(name)}
          </span>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.15em] text-outline">
              {brand}
            </p>
            <p className="text-sm font-medium truncate">{name}</p>
            <p className="text-[10px] uppercase tracking-widest text-outline">
              {zone ? BODY_ZONE_LABELS[zone] : "Non posé"}
            </p>
          </div>
        </Link>
        <div className="flex flex-col items-end gap-2">
          {feedback && (
            <span
              className={clsx(
                "text-[9px] px-2 py-0.5 rounded-full uppercase font-bold tracking-widest",
                feedback === "liked"
                  ? "bg-primary text-on-primary"
                  : "border border-error text-error",
              )}
            >
              {feedback === "liked" ? "Liked" : "Disliked"}
            </span>
          )}
          <button
            type="button"
            onClick={() =>
              onWishlist(feedback === "disliked" ? "disliked" : "liked")
            }
            className={clsx(
              "text-[10px] uppercase tracking-widest font-bold flex items-center gap-1 transition-colors",
              status ? "text-primary" : "text-outline hover:text-on-background",
            )}
          >
            <Icon name="favorite" filled={Boolean(status)} size={14} />
            {status ? "Wishlist" : "Wishlist +"}
          </button>
        </div>
      </div>
    </li>
  );
}
