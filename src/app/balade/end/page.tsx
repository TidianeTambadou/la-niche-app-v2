"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { clsx } from "clsx";
import { Icon } from "@/components/Icon";
import {
  BodySilhouette,
  fragranceInitials,
  type PlacedMarker,
} from "@/components/BodySilhouette";
import {
  BODY_ZONE_LABELS,
  type BodyZone,
} from "@/lib/fragrances";
import { useFragrances } from "@/lib/data";
import {
  useStore,
  type BodyPlacement,
  type FinishedBalade,
} from "@/lib/store";

/* -------------------------------------------------------------------------
 * Review row data — one row per placement we ask the user to rate at the
 * end of the balade. Falls back to fragranceMeta for external Fragrantica
 * picks not in the local catalog.
 * --------------------------------------------------------------------- */

type ReviewItem = {
  rowId: string;
  fragranceId: string;
  name: string;
  brand: string;
  imageUrl: string | null;
  zone: BodyZone;
  position?: [number, number, number];
  /** What the user said during the in-balade test (smelled & rated) — purely
   *  historical, separate from the end-review like/dislike that goes to
   *  wishlist. */
  inBaladeFeedback: "liked" | "disliked" | null;
};

export default function EndOfBaladePage() {
  const router = useRouter();
  const fragrances = useFragrances();
  const { activeBalade, history, addToWishlist, isWishlisted, endBalade } =
    useStore();
  const [archived, setArchived] = useState<FinishedBalade | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const [celebrationOut, setCelebrationOut] = useState(false);

  const balade = activeBalade ?? archived ?? history[0] ?? null;

  useEffect(() => {
    if (!activeBalade && !archived && history.length === 0) {
      router.replace("/balade");
    }
  }, [activeBalade, archived, history.length, router]);

  /* Build the review list — placements first (the canonical "what the user
     applied"), enriched with the in-balade feedback when matching. */
  const reviewItems: ReviewItem[] = useMemo(() => {
    if (!balade) return [];
    const feedbackByKey = new Map<string, "liked" | "disliked" | null>();
    for (const t of balade.tested) {
      feedbackByKey.set(t.fragranceId, t.feedback);
    }
    return balade.placements.map((p, idx) =>
      buildReviewItem(p, idx, feedbackByKey, fragrances),
    );
  }, [balade, fragrances]);

  /* The body silhouette has all placements visible. The currently-reviewed
     row drives `highlightedZone` so the camera dollies onto its zone. */
  const filledMarkers: PlacedMarker[] = useMemo(
    () =>
      reviewItems.map((r) => ({
        fragranceId: r.fragranceId,
        zone: r.zone,
        label: fragranceInitials(r.name),
        position: r.position,
      })),
    [reviewItems],
  );

  const [reviewedRowId, setReviewedRowId] = useState<string | null>(null);

  // Auto-highlight the first item on mount so the user immediately sees a
  // zone on the silhouette (rather than the default front view).
  useEffect(() => {
    if (!reviewedRowId && reviewItems.length > 0) {
      setReviewedRowId(reviewItems[0].rowId);
    }
  }, [reviewItems, reviewedRowId]);

  const highlightedZone = useMemo(() => {
    const item = reviewItems.find((r) => r.rowId === reviewedRowId);
    return item?.zone ?? null;
  }, [reviewItems, reviewedRowId]);

  function commit() {
    if (!activeBalade) return;
    const snap = { ...activeBalade, finishedAt: Date.now() };
    setCelebrating(true);
    setCelebrationOut(false);
    // Start exit animation 400ms before unmounting
    setTimeout(() => setCelebrationOut(true), 1800);
    setTimeout(() => {
      endBalade();
      setArchived(snap);
      setCelebrating(false);
      setCelebrationOut(false);
    }, 2200);
  }

  if (!balade) return null;

  return (
    <div className="px-6 pt-4 pb-36">
      {/* ── Celebration overlay ───────────────────────────────────────── */}
      {celebrating && (
        <div
          className={
            celebrationOut
              ? "fixed inset-0 z-50 flex flex-col items-center justify-center bg-background celebration-out pointer-events-none"
              : "fixed inset-0 z-50 flex flex-col items-center justify-center bg-background"
          }
        >
          <div className="celebration-in flex flex-col items-center gap-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-laniche.png"
              alt="La Niche"
              className="w-32 object-contain"
            />
            <div className="flex flex-col items-center gap-3">
              <Icon name="check_circle" size={32} className="text-primary" />
              <p className="text-[11px] uppercase tracking-[0.4em] text-outline">
                Balade archivée
              </p>
            </div>
          </div>
        </div>
      )}
      <header className="mb-6">
        <span className="text-[10px] uppercase tracking-[0.3em] text-outline block mb-2">
          {activeBalade ? "Re-sens et juge" : "Mémoire de balade"}
        </span>
        <h1 className="text-3xl font-bold tracking-tighter leading-tight">
          {activeBalade
            ? "Tes parfums ont eu le temps d'évoluer."
            : balade.mode === "free"
              ? "Balade libre"
              : "Balade guidée"}
        </h1>
        {activeBalade && (
          <p className="text-xs text-on-surface-variant mt-3 leading-relaxed">
            Touche un parfum dans la liste : le mannequin t&apos;indique où tu
            l&apos;as posé. Re-sens ta peau à cet endroit, puis dis si tu
            l&apos;aimes vraiment. Tes likes alimentent les recommandations.
          </p>
        )}
      </header>

      {/* Big body silhouette — always-visible reminder of WHERE each pose is.
          Clicking a row below dollies the camera onto its zone. */}
      <section className="bg-surface-container-low border border-outline-variant py-4 mb-6">
        <BodySilhouette
          filledMarkers={filledMarkers}
          highlightedZone={highlightedZone}
          readOnly
        />
      </section>

      {/* Per-row review */}
      <section className="mb-8">
        <h2 className="text-[10px] uppercase tracking-[0.2em] font-bold mb-3">
          {activeBalade
            ? `À évaluer (${reviewItems.length})`
            : `Parfums (${reviewItems.length})`}
        </h2>
        {reviewItems.length === 0 ? (
          <p className="text-xs text-outline italic">
            Aucune pose enregistrée.
          </p>
        ) : (
          <ul className="space-y-3">
            {reviewItems.map((item) => (
              <ReviewCard
                key={item.rowId}
                item={item}
                isFocused={reviewedRowId === item.rowId}
                wishlistStatus={isWishlisted(item.fragranceId)}
                onFocus={() => setReviewedRowId(item.rowId)}
                onLike={() =>
                  addToWishlist(item.fragranceId, "liked", "balade")
                }
                onDislike={() =>
                  addToWishlist(item.fragranceId, "disliked", "balade")
                }
              />
            ))}
          </ul>
        )}
      </section>

      {/* Footer actions — sticky above the tab bar */}
      <div className="fixed bottom-20 left-0 right-0 z-30 px-6 pb-2">
        <div className="bg-background/95 backdrop-blur-sm border-t border-outline-variant/30 pt-3 flex flex-col gap-2">
          {activeBalade ? (
            <>
              <button
                type="button"
                onClick={commit}
                disabled={celebrating}
                className="w-full py-4 bg-primary text-on-primary rounded-full text-xs uppercase tracking-[0.2em] font-bold active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Icon name="check" size={16} />
                Terminer & archiver
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
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * ReviewCard — one row per placement, with prominent Like/Dislike CTAs.
 *
 * The card is tappable: focusing it dollies the body silhouette above onto
 * the zone where the perfume was applied → the user can re-sense their
 * skin at that spot and decide if they really like it.
 * --------------------------------------------------------------------- */

function ReviewCard({
  item,
  isFocused,
  wishlistStatus,
  onFocus,
  onLike,
  onDislike,
}: {
  item: ReviewItem;
  isFocused: boolean;
  wishlistStatus: "liked" | "disliked" | null;
  onFocus: () => void;
  onLike: () => void;
  onDislike: () => void;
}) {
  return (
    <li>
      <div
        className={clsx(
          "border bg-background transition-all",
          isFocused
            ? "border-primary shadow-md"
            : "border-outline-variant/60",
        )}
      >
        <button
          type="button"
          onClick={onFocus}
          className="w-full flex items-stretch gap-3 p-3 text-left"
        >
          <PerfumeThumbnail imageUrl={item.imageUrl} name={item.name} />
          <div className="flex-1 min-w-0 flex flex-col">
            <p className="text-[10px] uppercase tracking-[0.15em] text-outline">
              {item.brand}
            </p>
            <p className="text-sm font-semibold tracking-tight truncate">
              {item.name}
            </p>
            <div className="mt-1 flex items-center gap-1.5 text-[10px] text-on-surface-variant">
              <Icon name="near_me" size={11} />
              <span className="uppercase tracking-widest font-medium">
                {BODY_ZONE_LABELS[item.zone]}
              </span>
            </div>
            {item.inBaladeFeedback && (
              <p className="mt-1 text-[9px] uppercase tracking-widest text-outline">
                Réaction au test :{" "}
                <span className="text-on-background">
                  {item.inBaladeFeedback === "liked" ? "👍" : "👎"}
                </span>
              </p>
            )}
          </div>
          {isFocused && (
            <div className="flex-shrink-0 flex items-start">
              <Icon
                name="my_location"
                size={14}
                className="text-primary mt-1"
              />
            </div>
          )}
        </button>
        <div className="border-t border-outline-variant/40 grid grid-cols-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDislike();
              onFocus();
            }}
            className={clsx(
              "flex items-center justify-center gap-2 py-3 text-[10px] uppercase tracking-widest font-bold transition-colors",
              wishlistStatus === "disliked"
                ? "bg-error/10 text-error"
                : "text-outline hover:text-error hover:bg-error/5",
            )}
            aria-pressed={wishlistStatus === "disliked"}
          >
            <Icon
              name="thumb_down"
              filled={wishlistStatus === "disliked"}
              size={14}
            />
            {wishlistStatus === "disliked" ? "Pas pour moi" : "Pas trop"}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onLike();
              onFocus();
            }}
            className={clsx(
              "flex items-center justify-center gap-2 py-3 text-[10px] uppercase tracking-widest font-bold border-l border-outline-variant/40 transition-colors",
              wishlistStatus === "liked"
                ? "bg-primary text-on-primary"
                : "text-on-background hover:bg-primary/5",
            )}
            aria-pressed={wishlistStatus === "liked"}
          >
            <Icon
              name="favorite"
              filled={wishlistStatus === "liked"}
              size={14}
            />
            {wishlistStatus === "liked" ? "Wishlist ✓" : "J'aime"}
          </button>
        </div>
      </div>
    </li>
  );
}

/* -------------------------------------------------------------------------
 * PerfumeThumbnail — same inline-style approach as in /balade/free, kept
 * local to avoid an import dependency.
 * --------------------------------------------------------------------- */

function PerfumeThumbnail({
  imageUrl,
  name,
}: {
  imageUrl: string | null;
  name: string;
}) {
  const [failed, setFailed] = useState(false);
  const px = 48;
  const boxStyle: React.CSSProperties = {
    width: `${px}px`,
    height: `${px}px`,
    minWidth: `${px}px`,
    minHeight: `${px}px`,
    maxWidth: `${px}px`,
    maxHeight: `${px}px`,
    flexShrink: 0,
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
  if (!imageUrl || failed) {
    return (
      <div
        style={boxStyle}
        className="bg-surface-container-high border border-outline-variant text-on-surface-variant font-bold font-mono text-[10px]"
      >
        {fragranceInitials(name)}
      </div>
    );
  }
  return (
    <div style={boxStyle} className="bg-surface-container-low">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt={name}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
        }}
        onError={() => setFailed(true)}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Helper: build a ReviewItem from a placement, falling back to the
 * snapshot meta for external Fragrantica picks not in the local catalog.
 * --------------------------------------------------------------------- */

function buildReviewItem(
  p: BodyPlacement,
  idx: number,
  feedbackByKey: Map<string, "liked" | "disliked" | null>,
  fragrances: ReturnType<typeof useFragrances>,
): ReviewItem {
  const f = fragrances.find((x) => x.key === p.fragranceId);
  const meta = p.fragranceMeta;
  const name = f?.name ?? meta?.name ?? "(parfum inconnu)";
  const brand = f?.brand ?? meta?.brand ?? "";
  const imageUrl = f?.imageUrl ?? meta?.imageUrl ?? null;
  return {
    rowId: `${p.zone}::${p.fragranceId}::${idx}`,
    fragranceId: p.fragranceId,
    name,
    brand,
    imageUrl,
    zone: p.zone,
    position: p.position,
    inBaladeFeedback: feedbackByKey.get(p.fragranceId) ?? null,
  };
}
