"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { Icon } from "@/components/Icon";
import { ErrorBubble } from "@/components/ErrorBubble";
import { PerfumeArtwork } from "@/components/PerfumeArtwork";
import {
  BodySilhouette,
  fragranceInitials,
} from "@/components/BodySilhouette";
import {
  BODY_ZONE_LABELS,
  type BodyZone,
} from "@/lib/fragrances";
import { fragranceKey, useFragrances, type Fragrance } from "@/lib/data";
import { useStore, type BodyPlacement } from "@/lib/store";
import { agentAsk, agentSearch } from "@/lib/agent-client";
import type { SearchCandidate } from "@/lib/agent";

export default function FreeBaladePage() {
  const router = useRouter();
  const fragrances = useFragrances();
  const {
    activeBalade,
    startBalade,
    layerOnBody,
    movePlacement,
    removePlacementAt,
  } = useStore();

  const [selectedZone, setSelectedZone] = useState<BodyZone | null>(null);
  /**
   * Free-balade flow state machine. Reflects the real perfumery sequence:
   * smell first (search OR scan a perfume), THEN decide where on the body
   * you want it.
   *
   *   idle       → user can drag/zoom the model. Body taps do not place.
   *   searching  → SearchSheet open
   *   scanning   → ScanSheet open
   *   placing    → fragrance picked, body becomes interactive: next tap on
   *                the mannequin draws the marker at the click point.
   *   confirming → tap registered; isLayering=true means the zone already
   *                holds another perfume and committing will analyse the mix.
   */
  type Flow =
    | { kind: "idle" }
    | { kind: "scanning" }
    | { kind: "placing"; fragrance: Fragrance }
    | {
        kind: "confirming";
        fragrance: Fragrance;
        zone: BodyZone;
        position: [number, number, number];
        isLayering: boolean;
      };
  const [flow, setFlow] = useState<Flow>({ kind: "idle" });
  /** Layering analysis state — when set, a toast displays the mix description
   *  returned by the La Niche team's analysis (or a loading state). */
  const [layeringAnalysis, setLayeringAnalysis] = useState<{
    zone: BodyZone;
    mixed: string[];
    text: string | null;
    error: string | null;
  } | null>(null);
  const [editingFragranceId, setEditingFragranceId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!activeBalade) {
      startBalade({ mode: "free" });
    } else if (activeBalade.mode !== "free") {
      router.replace("/balade/guided/active");
    }
  }, [activeBalade, startBalade, router]);

  const placements = activeBalade?.placements ?? [];

  // When in placement mode, dim already-occupied markers so the user sees
  // those zones are taken (a tap there triggers the layering flow).
  const isPlacingFlow =
    flow.kind === "placing" || flow.kind === "confirming";
  const filledMarkers = useMemo(
    () =>
      placements
        .map((p) => {
          const f = fragrances.find((x) => x.key === p.fragranceId);
          const meta = p.fragranceMeta;
          const name = f?.name ?? meta?.name;
          if (!name) return null;
          return {
            fragranceId: p.fragranceId,
            zone: p.zone,
            label: fragranceInitials(name),
            position: p.position,
            dimmed: isPlacingFlow,
          };
        })
        .filter((m): m is NonNullable<typeof m> => Boolean(m)),
    [placements, fragrances, isPlacingFlow],
  );

  /** Set of zones that already hold at least one perfume — drives the
   *  greying overlay AND the layering branch in handleBodyClick. */
  const occupiedZones = useMemo(() => {
    const s = new Set<BodyZone>();
    for (const p of placements) s.add(p.zone);
    return s;
  }, [placements]);

  function handleBodyClick(
    zone: BodyZone,
    position: [number, number, number],
  ) {
    // 1) MOVE flow takes priority (user clicked "déplacer" on an existing
    //    placement and is now picking a new point). Move is INSTANT (the user
    //    explicitly chose to relocate; no second confirmation).
    if (editingFragranceId) {
      movePlacement(editingFragranceId, zone, position);
      setEditingFragranceId(null);
      setSelectedZone(zone);
      return;
    }

    // 2) PLACEMENT flow: tap = preview only. Move into "confirming" state,
    //    keep the same fragrance, store the candidate zone/position. If the
    //    zone already holds a perfume the confirm becomes a "layering" — same
    //    state, isLayering=true, the banner copy + after-effect change.
    if (flow.kind === "placing" || flow.kind === "confirming") {
      const fragrance = flow.fragrance;
      const isLayering = occupiedZones.has(zone);
      setFlow({ kind: "confirming", fragrance, zone, position, isLayering });
      setSelectedZone(zone);
      return;
    }

    // 3) IDLE: tap only zooms (handled internally by BodySilhouette3D).
  }

  /** Last successful placement — drives the success toast that briefly shows
   *  before returning to the question screen. */
  const [lastPlaced, setLastPlaced] = useState<{
    name: string;
    zone: BodyZone;
    imageUrl: string | null;
  } | null>(null);

  function confirmPlacement() {
    if (flow.kind !== "confirming") return;
    const meta: BodyPlacement["fragranceMeta"] = {
      name: flow.fragrance.name,
      brand: flow.fragrance.brand,
      imageUrl: flow.fragrance.imageUrl,
    };
    const wasLayering = flow.isLayering;
    const targetZone = flow.zone;
    const newName = flow.fragrance.name;
    const newBrand = flow.fragrance.brand;
    layerOnBody(targetZone, flow.fragrance.key, flow.position, meta);
    setLastPlaced({
      name: newName,
      zone: targetZone,
      imageUrl: flow.fragrance.imageUrl,
    });
    setFlow({ kind: "idle" });

    // Layering: ask the La Niche team to describe what the mix smells like.
    if (wasLayering) {
      const existing = placements
        .filter((p) => p.zone === targetZone)
        .map((p) => {
          const f = fragrances.find((x) => x.key === p.fragranceId);
          return f
            ? `${f.brand} ${f.name}`
            : p.fragranceMeta
              ? `${p.fragranceMeta.brand} ${p.fragranceMeta.name}`
              : null;
        })
        .filter((s): s is string => Boolean(s));
      const all = [...existing, `${newBrand} ${newName}`];
      setLayeringAnalysis({
        zone: targetZone,
        mixed: all,
        text: null,
        error: null,
      });
      const prompt = `Analyse de layering — l'utilisateur vient de superposer plusieurs parfums sur la même zone du corps (${BODY_ZONE_LABELS[targetZone]}). Les parfums mélangés sont : ${all.join(" + ")}.

Décris en 3-4 phrases concrètes ce que ce mélange va donner sur la peau : accords dominants qui ressortent, notes qui peuvent rentrer en conflit, type de sillage attendu, et un verdict honnête (réussi, risqué, à éviter ?). Pas de jargon, ton direct, comme un conseiller en boutique.`;
      agentAsk(prompt)
        .then((text) => {
          setLayeringAnalysis((prev) =>
            prev && prev.zone === targetZone ? { ...prev, text } : prev,
          );
        })
        .catch((e: unknown) => {
          setLayeringAnalysis((prev) =>
            prev && prev.zone === targetZone
              ? {
                  ...prev,
                  error: e instanceof Error ? e.message : "analysis failed",
                }
              : prev,
          );
        });
    }
  }

  // Auto-dismiss the success toast after 3 s.
  useEffect(() => {
    if (!lastPlaced) return;
    const id = setTimeout(() => setLastPlaced(null), 3000);
    return () => clearTimeout(id);
  }, [lastPlaced]);

  /** Called by SearchSheet / ScanSheet when the user picks a fragrance from
   *  the local catalog. */
  function onFragranceChosen(fragrance: Fragrance) {
    setFlow({ kind: "placing", fragrance });
  }

  /** Called when the user picks a Fragrantica candidate from the inline
   *  autocomplete. We synthesize a Fragrance object so the rest of the flow
   *  (placing → confirming → marker) is unchanged. */
  function onCandidatePicked(c: SearchCandidate) {
    const synthetic: Fragrance = {
      key: fragranceKey(c.brand, c.name),
      id: fragranceKey(c.brand, c.name),
      name: c.name,
      brand: c.brand,
      imageUrl: c.image_url ?? null,
      reference: `FR-${fragranceKey(c.brand, c.name).slice(0, 6).toUpperCase()}`,
      availability: [],
      bestPrice: null,
      tags: c.notes_brief ? [c.notes_brief] : [],
      family: c.family,
    };
    setFlow({ kind: "placing", fragrance: synthetic });
  }

  function cancelFlow() {
    setFlow({ kind: "idle" });
    setEditingFragranceId(null);
    setSelectedZone(null);
  }

  function startMove(fragranceId: string) {
    setEditingFragranceId(fragranceId);
    setFlow({ kind: "idle" });
    setSelectedZone(null);
  }

  // Resolve the perfume currently in flight (placing/confirming OR moving an
  // existing one) so we can show its image + name above the mannequin.
  const inFlightFragrance =
    flow.kind === "placing" || flow.kind === "confirming"
      ? {
          name: flow.fragrance.name,
          brand: flow.fragrance.brand,
          imageUrl: flow.fragrance.imageUrl,
        }
      : editingFragranceId
        ? (() => {
            const f = fragrances.find((x) => x.key === editingFragranceId);
            const meta = placements.find(
              (p) => p.fragranceId === editingFragranceId,
            )?.fragranceMeta;
            return f
              ? { name: f.name, brand: f.brand, imageUrl: f.imageUrl }
              : meta
                ? {
                    name: meta.name,
                    brand: meta.brand,
                    imageUrl: meta.imageUrl ?? null,
                  }
                : null;
          })()
        : null;

  const showMannequin =
    flow.kind === "placing" ||
    flow.kind === "confirming" ||
    Boolean(editingFragranceId);

  return (
    <div className="px-6 pt-4 pb-32">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <span className="text-[10px] uppercase tracking-[0.3em] text-outline block mb-2">
            Balade libre
          </span>
          <h1 className="text-2xl font-bold tracking-tighter leading-tight">
            {showMannequin && inFlightFragrance
              ? editingFragranceId
                ? `Déplace ${inFlightFragrance.name}`
                : flow.kind === "confirming"
                  ? "C'est bien ici ?"
                  : `Où as-tu mis ce parfum ?`
              : placements.length === 0
                ? "Démarre ta balade"
                : "Encore un parfum ?"}
          </h1>
        </div>
        <Link
          href="/balade/end"
          className="text-[10px] uppercase tracking-widest font-bold border-b border-primary pb-0.5 flex-shrink-0 mt-2"
        >
          Terminer
        </Link>
      </header>

      {/* Always-visible recent poses rail (compact thumbnails) — gives the
          user a sense of progress + quick access to edit/delete. */}
      {placements.length > 0 && !showMannequin && (
        <PoseRail
          placements={placements}
          fragrances={fragrances}
          onSelect={(fragranceId) => startMove(fragranceId)}
        />
      )}

      {/* Conditional view: mannequin only when something is in progress. */}
      {showMannequin ? (
        <>
          {/* Big perfume context card — keeps the user oriented on what they
              are placing while they tap on the body. */}
          {inFlightFragrance && (
            <section className="mb-4 border border-primary bg-surface-container-low p-2 flex items-center gap-3">
              <PlacementThumbnail
                imageUrl={inFlightFragrance.imageUrl}
                name={inFlightFragrance.name}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-[0.2em] text-outline">
                  {inFlightFragrance.brand}
                </p>
                <p className="text-sm font-semibold tracking-tight truncate">
                  {inFlightFragrance.name}
                </p>
              </div>
              <button
                type="button"
                onClick={cancelFlow}
                aria-label="Annuler"
                className="text-outline hover:text-on-background flex-shrink-0 p-1"
              >
                <Icon name="close" size={18} />
              </button>
            </section>
          )}

          <p className="text-xs text-on-surface-variant mb-3 text-center">
            {editingFragranceId
              ? "Touche un nouveau point sur le corps."
              : flow.kind === "placing"
                ? occupiedZones.size > 0
                  ? "Touche la zone du corps où tu l'as appliqué. Les zones grisées sont déjà occupées — re-toucher = layering."
                  : "Touche la zone du corps où tu l'as appliqué."
                : flow.kind === "confirming"
                  ? flow.isLayering
                    ? "Cette zone est déjà occupée. Confirme pour layerer, ou retouche ailleurs."
                    : "Re-touche pour ajuster, ou confirme en bas."
                  : null}
          </p>
          <section className="bg-surface-container-low border border-primary py-4 mb-8 transition-colors">
            <BodySilhouette
              filledMarkers={filledMarkers}
              highlightedZone={selectedZone}
              onBodyClick={handleBodyClick}
              placementMode
            />
          </section>
        </>
      ) : (
        <QuestionScreen
          poseCount={placements.length}
          onScan={() => setFlow({ kind: "scanning" })}
          onCandidatePicked={onCandidatePicked}
        />
      )}

      <section className="mb-8">
        <h2 className="text-[10px] uppercase tracking-[0.2em] font-bold mb-3">
          Poses ({placements.length})
        </h2>
        {placements.length === 0 ? (
          <p className="text-xs text-outline italic">
            Aucune pose pour le moment.
          </p>
        ) : (
          <ul className="border-t border-outline-variant/40">
            {placements.map((p) => {
              // Try local catalog first; fall back to placement.fragranceMeta
              // for external Fragrantica picks not in the shop_stock catalog.
              const catalogFrag = fragrances.find(
                (x) => x.key === p.fragranceId,
              );
              const display = catalogFrag
                ? {
                    key: catalogFrag.key,
                    name: catalogFrag.name,
                    brand: catalogFrag.brand,
                    imageUrl: catalogFrag.imageUrl,
                    isExternal: false,
                  }
                : p.fragranceMeta
                  ? {
                      key: p.fragranceId,
                      name: p.fragranceMeta.name,
                      brand: p.fragranceMeta.brand,
                      imageUrl: p.fragranceMeta.imageUrl ?? null,
                      isExternal: true,
                    }
                  : null;
              if (!display) return null;
              const isEditing = editingFragranceId === display.key;
              const layerCount = placements.filter(
                (q) => q.zone === p.zone,
              ).length;
              return (
                <li
                  key={`${p.zone}::${p.fragranceId}`}
                  className={clsx(
                    "py-4 border-b border-outline-variant/40",
                    isEditing && "bg-surface-container-low",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <PlacementThumbnail
                        imageUrl={display.imageUrl}
                        name={display.name}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {display.name}
                        </p>
                        <p className="text-[10px] uppercase tracking-widest text-outline">
                          {display.brand} · {BODY_ZONE_LABELS[p.zone]}
                          {layerCount > 1 && (
                            <span className="ml-2 text-primary">
                              · LAYER {layerCount}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => startMove(display.key)}
                        className={clsx(
                          "p-2 hover:text-primary transition-colors",
                          isEditing && "text-primary",
                        )}
                        aria-label="Déplacer"
                      >
                        <Icon name="open_with" size={18} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removePlacementAt(p.zone, p.fragranceId)}
                        className="p-2 hover:text-error transition-colors"
                        aria-label="Supprimer cette pose"
                      >
                        <Icon name="delete_outline" size={18} />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Floating banner — three variants depending on flow. The thumbnail
          image identifies the fragrance at a glance instead of an abstract
          color tag. */}
      {flow.kind === "placing" && (
        <ActionBanner
          label="Touche le corps pour positionner"
          fragranceName={flow.fragrance.name}
          fragranceImage={flow.fragrance.imageUrl}
          onCancel={cancelFlow}
        />
      )}
      {flow.kind === "confirming" && (
        <ActionBanner
          label={
            flow.isLayering
              ? `Layering · ${BODY_ZONE_LABELS[flow.zone]} déjà parfumée. L'équipe La Niche analysera le mélange.`
              : "Confirmer la pose ici ?"
          }
          fragranceName={flow.fragrance.name}
          fragranceImage={flow.fragrance.imageUrl}
          onCancel={cancelFlow}
          confirmLabel={flow.isLayering ? "Layer ici" : "Confirmer"}
          onConfirm={confirmPlacement}
        />
      )}
      {editingFragranceId && flow.kind === "idle" && (() => {
        const f = fragrances.find((f) => f.key === editingFragranceId);
        const meta = placements.find(
          (p) => p.fragranceId === editingFragranceId,
        )?.fragranceMeta;
        return (
          <ActionBanner
            label="Déplace vers un nouveau point"
            fragranceName={f?.name ?? meta?.name ?? ""}
            fragranceImage={f?.imageUrl ?? meta?.imageUrl ?? null}
            onCancel={cancelFlow}
          />
        );
      })()}

      {/* Sticky bottom bar — visible only in idle state when at least one
          pose exists. Two equal-weight CTAs: continue (do nothing, just close
          the bar visually) OR finish the balade. */}
      {!showMannequin &&
        flow.kind === "idle" &&
        placements.length > 0 && (
          <FinishStickyBar count={placements.length} />
        )}

      {/* Success toast shown briefly after each placement commits. Auto-
          dismisses after 3 s; user gets visual confirmation before the page
          swaps back to the question screen. */}
      {lastPlaced && (
        <SuccessToast
          name={lastPlaced.name}
          zone={lastPlaced.zone}
          imageUrl={lastPlaced.imageUrl}
        />
      )}

      {/* Layering analysis sheet — shown after a layering pose commits while
          the La Niche team writes up the mix verdict. */}
      {layeringAnalysis && (
        <LayeringAnalysisSheet
          zone={layeringAnalysis.zone}
          mixed={layeringAnalysis.mixed}
          text={layeringAnalysis.text}
          error={layeringAnalysis.error}
          onClose={() => setLayeringAnalysis(null)}
        />
      )}

      {/* SearchSheet removed — search is now an inline autocomplete in
          QuestionScreen, hitting the AI agent (Fragrantica web_search).
          Only Scan still needs a fullscreen sheet (camera). */}
      {flow.kind === "scanning" && (
        <ScanSheet
          fragrances={fragrances}
          onPick={onFragranceChosen}
          onClose={cancelFlow}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * PlacementThumbnail — square image with initials fallback when load fails.
 * --------------------------------------------------------------------- */

function PlacementThumbnail({
  imageUrl,
  name,
  size = "sm",
}: {
  imageUrl: string | null | undefined;
  name: string;
  size?: "xs" | "sm" | "md" | "lg";
}) {
  const [failed, setFailed] = useState(false);
  // Inline-styled square — guarantees the thumbnail stays exactly this size,
  // independent of any flex/parent constraints. Tailwind w-* classes were
  // sometimes losing to natural image size in flex parents.
  const px =
    size === "xs" ? 24 : size === "sm" ? 32 : size === "md" ? 40 : 56;
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
  const imgStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  };

  if (!imageUrl || failed) {
    return (
      <div
        style={boxStyle}
        className="bg-surface-container-high border border-outline-variant text-on-surface-variant font-bold font-mono"
        aria-hidden
      >
        <span style={{ fontSize: px <= 28 ? 9 : 10 }}>
          {fragranceInitials(name)}
        </span>
      </div>
    );
  }

  return (
    <div style={boxStyle} className="bg-surface-container-low">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt={name}
        style={imgStyle}
        onError={() => setFailed(true)}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------
 * PoseRail — compact horizontal thumbnail rail of recent placements.
 *
 * Always visible above the question screen so the user always sees what
 * they've already done. Tap a thumbnail to start a "déplacer" flow on it.
 * --------------------------------------------------------------------- */

function PoseRail({
  placements,
  fragrances,
  onSelect,
}: {
  placements: BodyPlacement[];
  fragrances: Fragrance[];
  onSelect: (fragranceId: string) => void;
}) {
  const items = placements
    .map((p) => {
      const f = fragrances.find((x) => x.key === p.fragranceId);
      const meta = p.fragranceMeta;
      const name = f?.name ?? meta?.name;
      const imageUrl = f?.imageUrl ?? meta?.imageUrl ?? null;
      if (!name) return null;
      return {
        fragranceId: p.fragranceId,
        zone: p.zone,
        name,
        imageUrl,
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .reverse(); // most recent first

  return (
    <section className="mb-6">
      <div className="flex justify-between items-end mb-2">
        <p className="text-[10px] uppercase tracking-[0.2em] text-outline">
          Tes parfums ({items.length})
        </p>
        <p className="text-[9px] uppercase tracking-widest text-outline">
          Touche pour modifier
        </p>
      </div>
      <div className="flex gap-2 overflow-x-auto hide-scrollbar -mx-6 px-6 pb-1">
        {items.map((it) => (
          <button
            key={`${it.zone}::${it.fragranceId}`}
            type="button"
            onClick={() => onSelect(it.fragranceId)}
            className="flex-shrink-0 group flex flex-col items-center"
            aria-label={`Modifier ${it.name}`}
          >
            <PlacementThumbnail
              imageUrl={it.imageUrl}
              name={it.name}
              size="md"
            />
            <span className="text-[8px] uppercase tracking-widest text-outline mt-1 max-w-[40px] truncate">
              {BODY_ZONE_LABELS[it.zone].split(" ")[0]}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------
 * FinishStickyBar — sticky bottom bar in idle state with ≥1 placement.
 *
 * Big "Terminer la balade" CTA so users don't miss it. Sits at z-30 (under
 * the action banner z-50 + tab bar z-40 — but it's only shown when those
 * aren't visible).
 * --------------------------------------------------------------------- */

function FinishStickyBar({ count }: { count: number }) {
  return (
    <div className="fixed inset-x-0 bottom-20 z-30 flex justify-center px-4 pointer-events-none">
      <Link
        href="/balade/end"
        className="pointer-events-auto bg-primary text-on-primary px-6 py-3 shadow-2xl flex items-center gap-3 max-w-md w-full justify-between active:scale-95 transition-transform"
      >
        <span className="flex items-center gap-2">
          <Icon name="check_circle" filled size={16} />
          <span className="text-xs uppercase tracking-[0.2em] font-bold">
            Terminer · {count} parfum{count > 1 ? "s" : ""}
          </span>
        </span>
        <Icon name="arrow_forward" size={16} />
      </Link>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * SuccessToast — appears 3 s after a placement commits.
 * --------------------------------------------------------------------- */

function SuccessToast({
  name,
  zone,
  imageUrl,
}: {
  name: string;
  zone: BodyZone;
  imageUrl: string | null;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      className="fixed inset-x-0 top-20 z-50 flex justify-center px-4 pointer-events-none"
      role="status"
      aria-live="polite"
    >
      <div
        className={clsx(
          "pointer-events-auto bg-background border border-primary shadow-2xl flex items-stretch max-w-md w-full transition-all duration-300",
          mounted ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4",
        )}
      >
        <div className="flex items-center gap-3 px-3 py-2 flex-1 min-w-0">
          <PlacementThumbnail imageUrl={imageUrl} name={name} size="sm" />
          <Icon
            name="check_circle"
            filled
            size={16}
            className="text-primary flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p className="text-[9px] uppercase tracking-[0.2em] text-outline">
              Pose enregistrée
            </p>
            <p className="text-xs font-semibold tracking-tight truncate">
              {name} · {BODY_ZONE_LABELS[zone]}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * QuestionScreen — the default view between placements.
 *
 * Asks "Qu'est-ce que tu as senti ?" with two big CTAs (Scanner / Rechercher).
 * Replaces the mannequin while idle: once the user has identified a perfume,
 * the page swaps to the mannequin view so they can pick the body zone.
 * After commit, we come back here for the next perfume.
 * --------------------------------------------------------------------- */

function QuestionScreen({
  poseCount,
  onScan,
  onCandidatePicked,
}: {
  /** How many perfumes have already been logged in this balade. Drives the
   *  empty-state vs encouragement copy. */
  poseCount: number;
  onScan: () => void;
  /** Called when the user picks a fragrance from the autocomplete dropdown. */
  onCandidatePicked: (candidate: SearchCandidate) => void;
}) {
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<SearchCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Debounced search: 800ms after the last keystroke, hit /api/agent.
  // Minimum 3 chars before firing — keeps the rate-limit-tight Anthropic
  // budget healthy. Same query within 5 min comes from the client cache.
  useEffect(() => {
    const q = query.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();
    if (q.length < 3) {
      setCandidates([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    debounceRef.current = setTimeout(async () => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const results = await agentSearch(q, ctrl.signal);
        if (!ctrl.signal.aborted) {
          setCandidates(results);
          setLoading(false);
        }
      } catch (e: unknown) {
        if (!ctrl.signal.aborted) {
          setError(e instanceof Error ? e.message : "Erreur inconnue");
          setLoading(false);
        }
      }
    }, 800);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const isFirst = poseCount === 0;
  return (
    <section className="bg-surface-container-low border border-outline-variant px-5 py-8 mb-8">
      <p className="text-[10px] uppercase tracking-[0.3em] text-outline mb-3 text-center">
        {isFirst
          ? "Comment ça marche"
          : `${poseCount} parfum${poseCount > 1 ? "s" : ""} noté${poseCount > 1 ? "s" : ""} · Lequel ensuite ?`}
      </p>
      <h2 className="text-2xl md:text-3xl font-bold tracking-tighter leading-[1.05] mb-5 text-center">
        {isFirst ? (
          <>
            Sens un parfum,
            <br />
            <span className="italic font-serif font-light">
              dis-moi lequel.
            </span>
          </>
        ) : (
          <>
            Quel parfum
            <br />
            <span className="italic font-serif font-light">
              viens-tu de sentir ?
            </span>
          </>
        )}
      </h2>
      {isFirst && (
        <p className="text-xs text-on-surface-variant text-center mb-5 leading-relaxed">
          Identifie chaque parfum (Scanner ou Rechercher), puis touche le corps
          pour noter où tu l&apos;as appliqué. Reviens ici pour le suivant.
        </p>
      )}

      {/* Inline autocomplete — no modal. Hits the AI agent (Fragrantica
          web_search) with 600ms debounce. */}
      <div className="relative mb-3">
        <div className="flex items-center gap-2 border-b-2 border-primary pb-2">
          <Icon name="search" size={16} className="text-outline" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tape un nom (ex: Aventus, Vetiver)…"
            className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-outline/60"
            autoComplete="off"
          />
          {loading && (
            <Icon name="progress_activity" size={14} className="text-outline animate-spin" />
          )}
        </div>

        {/* Dropdown */}
        {(candidates.length > 0 || error || (query.length >= 3 && !loading)) && (
          <div className="absolute left-0 right-0 top-full mt-1 bg-background border border-outline-variant shadow-2xl z-20 max-h-64 overflow-y-auto">
            {error && (
              <ErrorBubble
                detail={error}
                context="Balade libre · recherche"
                variant="inline"
              />
            )}
            {!error && candidates.length === 0 && !loading && (
              <p className="px-4 py-3 text-xs text-outline italic">
                Aucun résultat sur Fragrantica pour « {query} ».
              </p>
            )}
            {candidates.map((c, i) => (
              <button
                key={`${c.brand}-${c.name}-${i}`}
                type="button"
                onClick={() => {
                  setQuery("");
                  setCandidates([]);
                  onCandidatePicked(c);
                }}
                className="w-full text-left px-3 py-2 hover:bg-surface-container-low border-b border-outline-variant/30 last:border-0 flex items-center gap-3"
              >
                <PerfumeArtwork
                  brand={c.brand}
                  name={c.name}
                  variant="thumb"
                  className="w-10 h-10 flex-shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] uppercase tracking-[0.15em] text-outline">
                    {c.brand}
                  </p>
                  <p className="text-sm font-medium truncate">{c.name}</p>
                  {c.notes_brief && (
                    <p className="text-[10px] text-on-surface-variant truncate mt-0.5">
                      {c.notes_brief}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 my-4">
        <div className="flex-1 h-px bg-outline-variant/40" />
        <span className="text-[9px] uppercase tracking-widest text-outline">
          ou
        </span>
        <div className="flex-1 h-px bg-outline-variant/40" />
      </div>

      <button
        type="button"
        onClick={onScan}
        className="w-full py-3 bg-primary text-on-primary rounded-full text-xs uppercase tracking-[0.2em] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
      >
        <Icon name="qr_code_scanner" size={16} />
        Scanner un flacon
      </button>
    </section>
  );
}

/* -------------------------------------------------------------------------
 * ActionBanner — pinned at the bottom while the user has a pending action
 * (place a new perfume OR move an existing one). Tells them what to do +
 * cancel.
 * --------------------------------------------------------------------- */

function ActionBanner({
  label,
  fragranceName,
  fragranceImage,
  onCancel,
  confirmLabel,
  onConfirm,
}: {
  label: string;
  fragranceName: string;
  /** Bottle image — shown as a 12×12 thumbnail at the left of the banner. */
  fragranceImage?: string | null;
  onCancel: () => void;
  /** When provided, render a primary confirm button on the right. */
  confirmLabel?: string;
  onConfirm?: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const hasConfirm = Boolean(confirmLabel && onConfirm);

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-24 pointer-events-none"
      role="status"
      aria-live="polite"
    >
      <div
        className={clsx(
          "pointer-events-auto bg-primary text-on-primary shadow-2xl flex items-stretch max-w-md w-full transition-all duration-300",
          mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
        )}
      >
        <div className="flex items-center gap-3 px-3 py-2 flex-1 min-w-0">
          <PlacementThumbnail
            imageUrl={fragranceImage}
            name={fragranceName}
            size="sm"
          />
          <div className="flex-1 min-w-0">
            <p className="text-[9px] uppercase tracking-[0.2em] opacity-70">
              {label}
            </p>
            <p className="text-sm font-semibold tracking-tight truncate">
              {fragranceName}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Annuler"
            className="opacity-70 hover:opacity-100 active:scale-95 transition-all flex-shrink-0"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
        {hasConfirm && (
          <button
            type="button"
            onClick={onConfirm}
            className="bg-on-primary text-primary px-5 py-3 text-[10px] uppercase tracking-[0.2em] font-bold active:scale-95 transition-transform flex items-center gap-1.5 flex-shrink-0"
          >
            <Icon name="check" size={14} />
            {confirmLabel}
          </button>
        )}
      </div>
    </div>
  );
}


/* -------------------------------------------------------------------------
 * SearchSheet + ScanSheet — bottom sheets for the perfume identification
 * step. Header just shows the action title (no zone yet — placement comes
 * AFTER picking the fragrance).
 * --------------------------------------------------------------------- */

function PickerSheet({
  title,
  icon,
  onClose,
  children,
}: {
  title: string;
  icon: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-primary/10 transition-opacity duration-300"
        style={{ opacity: mounted ? 1 : 0 }}
        onClick={onClose}
        aria-hidden
      />
      <div
        className={clsx(
          "relative w-full max-w-screen-md bg-background border-t border-outline-variant max-h-[38vh] flex flex-col safe-bottom shadow-2xl transition-transform duration-300 ease-out",
          mounted ? "translate-y-0" : "translate-y-full",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pt-1.5 pb-1 flex justify-center">
          <div className="w-10 h-1 bg-outline-variant rounded-full" />
        </div>
        <div className="px-5 pb-2 flex items-center justify-between gap-3 border-b border-outline-variant/40">
          <p className="text-[10px] uppercase tracking-[0.2em] font-bold flex items-center gap-2">
            <Icon name={icon} size={12} />
            {title}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="text-outline hover:text-on-background flex-shrink-0"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="flex-1 min-h-0 flex flex-col">{children}</div>
      </div>
    </div>
  );
}

function ScanSheet({
  fragrances,
  onPick,
  onClose,
}: {
  fragrances: Fragrance[];
  onPick: (f: Fragrance) => void;
  onClose: () => void;
}) {
  return (
    <PickerSheet
      title="Scanner un parfum"
      icon="qr_code_scanner"
      onClose={onClose}
    >
      <ScanPanel fragrances={fragrances} onPick={onPick} />
    </PickerSheet>
  );
}

/* ---- Scan panel — inline camera + mock recognition ------------------- */

function ScanPanel({
  fragrances,
  onPick,
}: {
  fragrances: Fragrance[];
  onPick: (f: Fragrance) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [stage, setStage] = useState<"idle" | "live" | "scanning" | "result">(
    "idle",
  );
  const [result, setResult] = useState<Fragrance | null>(null);
  const [error, setError] = useState<string | null>(null);

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }
  useEffect(() => stopCamera, []);

  // Attach the captured stream once the <video> element is mounted (which
  // only happens after stage flips to "live"/"scanning").
  useEffect(() => {
    if (stage !== "live" && stage !== "scanning") return;
    if (!videoRef.current || !streamRef.current) return;
    if (videoRef.current.srcObject === streamRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    videoRef.current.play().catch(() => {});
  }, [stage]);

  async function startCamera() {
    setError(null);
    if (fragrances.length === 0) {
      setError("Aucun parfum dans le catalogue à reconnaître.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      // The useEffect above attaches srcObject once the video mounts.
      setStage("live");
    } catch (e) {
      setError(
        e instanceof Error
          ? `Caméra indisponible : ${e.message}`
          : "Caméra indisponible",
      );
      setStage("idle");
    }
  }

  function captureAndIdentify() {
    if (fragrances.length === 0) return;
    setStage("scanning");
    setTimeout(() => {
      const pick =
        fragrances[Math.floor(Math.random() * fragrances.length)];
      stopCamera();
      setResult(pick);
      setStage("result");
    }, 1200);
  }

  return (
    <div className="flex-1 flex flex-col px-6 py-4 overflow-y-auto">
      {stage === "idle" && (
        <div className="flex flex-col items-center justify-center text-center gap-4 py-6">
          <Icon
            name="qr_code_scanner"
            size={36}
            className="text-on-surface-variant"
          />
          <p className="text-xs text-on-surface-variant max-w-xs">
            Pointe sur un flacon. La reconnaissance s&apos;active à la capture.
          </p>
          {error && (
            <p className="text-[11px] text-error border border-error/40 px-3 py-2 max-w-xs">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={startCamera}
            className="px-6 py-3 bg-primary text-on-primary rounded-full text-[10px] uppercase tracking-widest font-bold active:scale-95 transition-transform flex items-center gap-2"
          >
            <Icon name="photo_camera" size={14} />
            Ouvrir la caméra
          </button>
        </div>
      )}

      {(stage === "live" || stage === "scanning") && (
        <div className="flex flex-col gap-3">
          <div className="relative aspect-video bg-on-background overflow-hidden">
            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-2/3 aspect-square border border-on-primary/80" />
            </div>
            {stage === "scanning" && (
              <div className="absolute inset-0 bg-primary/40 flex items-center justify-center">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-on-primary rounded-full animate-pulse" />
                  <span
                    className="w-2 h-2 bg-on-primary rounded-full animate-pulse"
                    style={{ animationDelay: "150ms" }}
                  />
                  <span
                    className="w-2 h-2 bg-on-primary rounded-full animate-pulse"
                    style={{ animationDelay: "300ms" }}
                  />
                </div>
              </div>
            )}
            <span className="absolute top-2 left-2 text-[10px] uppercase tracking-widest font-mono bg-background/80 px-2 py-1 border border-outline-variant">
              {stage === "scanning" ? "ANALYSE…" : "CADRE"}
            </span>
          </div>
          <button
            type="button"
            onClick={captureAndIdentify}
            disabled={stage === "scanning"}
            className="w-full py-3 bg-primary text-on-primary rounded-full text-[10px] uppercase tracking-widest font-bold active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Icon name="center_focus_strong" size={14} />
            {stage === "scanning" ? "Analyse en cours" : "Capturer"}
          </button>
        </div>
      )}

      {stage === "result" && result && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 border border-outline-variant p-3">
            <div className="w-12 h-16 bg-surface-container-low overflow-hidden flex-shrink-0">
              {result.imageUrl && (
                <img
                  src={result.imageUrl}
                  alt=""
                  className="w-full h-full object-cover grayscale"
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-[0.15em] text-outline">
                {result.brand}
              </p>
              <p className="text-sm font-medium truncate">{result.name}</p>
              <p className="text-[10px] uppercase tracking-widest text-primary mt-0.5">
                Match 96%
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setStage("idle");
              }}
              className="flex-1 py-3 border border-outline-variant rounded-full text-[10px] uppercase tracking-widest font-bold hover:border-primary transition-colors"
            >
              Re-scanner
            </button>
            <button
              type="button"
              onClick={() => onPick(result)}
              className="flex-1 py-3 bg-primary text-on-primary rounded-full text-[10px] uppercase tracking-widest font-bold active:scale-95 transition-transform"
            >
              Poser ici
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * LayeringAnalysisSheet — bottom sheet that surfaces the verdict from the
 * La Niche team after a layering pose. Loading skeleton while the analysis
 * is in flight; ErrorBubble fallback if it fails.
 * --------------------------------------------------------------------- */

function LayeringAnalysisSheet({
  zone,
  mixed,
  text,
  error,
  onClose,
}: {
  zone: BodyZone;
  mixed: string[];
  text: string | null;
  error: string | null;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-on-background/30 transition-opacity duration-300"
        style={{ opacity: mounted ? 1 : 0 }}
        onClick={onClose}
        aria-hidden
      />
      <div
        className={clsx(
          "relative w-full max-w-screen-md bg-background border-t border-outline-variant max-h-[70vh] flex flex-col safe-bottom shadow-2xl transition-transform duration-300 ease-out",
          mounted ? "translate-y-0" : "translate-y-full",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pt-1.5 pb-1 flex justify-center">
          <div className="w-10 h-1 bg-outline-variant rounded-full" />
        </div>
        <header className="px-5 pb-3 border-b border-outline-variant/40 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.25em] text-outline">
              Layering · {BODY_ZONE_LABELS[zone]}
            </p>
            <p className="text-sm font-bold tracking-tight">
              Verdict de l&apos;équipe La Niche
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="text-outline hover:text-on-background flex-shrink-0"
          >
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className="px-5 py-4 flex-1 overflow-y-auto space-y-4">
          <div>
            <p className="text-[9px] uppercase tracking-widest text-outline mb-2">
              Mélange
            </p>
            <ul className="flex flex-col gap-1">
              {mixed.map((m, i) => (
                <li
                  key={`${m}-${i}`}
                  className="text-xs text-on-background border-l-2 border-primary pl-3 py-0.5"
                >
                  {m}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-widest text-outline mb-2">
              Analyse
            </p>
            {error ? (
              <ErrorBubble
                detail={error}
                context="Balade · analyse layering"
                variant="block"
              />
            ) : text ? (
              <p className="text-sm leading-relaxed text-on-background whitespace-pre-wrap">
                {text}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-[10px] uppercase tracking-widest text-outline font-mono">
                  L&apos;équipe La Niche analyse le mélange…
                </p>
                <div className="h-2 shimmer-bar w-full" />
                <div className="h-2 shimmer-bar w-[88%]" />
                <div className="h-2 shimmer-bar w-[62%]" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

