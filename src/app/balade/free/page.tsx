"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { useFragrances, type Fragrance } from "@/lib/data";
import { useStore } from "@/lib/store";

/** Delay (ms) before the picker sheet opens after a zone tap. Lets the 3D
 *  camera zoom + pulse animation play first. */
const PICKER_DELAY_MS = 450;

export default function FreeBaladePage() {
  const router = useRouter();
  const fragrances = useFragrances();
  const {
    activeBalade,
    startBalade,
    placeOnBody,
    layerOnBody,
    movePlacement,
    removePlacementAt,
  } = useStore();

  const [selectedZone, setSelectedZone] = useState<BodyZone | null>(null);
  /** Exact world-space point on the body where the user just clicked. Stored
   *  alongside selectedZone so the placement is "drawn" precisely there. */
  const [selectedPosition, setSelectedPosition] = useState<
    [number, number, number] | null
  >(null);
  const [picker, setPicker] = useState(false);
  const [placementMode, setPlacementMode] = useState<"replace" | "layer">(
    "replace",
  );
  /** Set when the user taps a zone that already holds at least one
   *  fragrance — opens the layering confirmation modal. */
  const [confirmingZone, setConfirmingZone] = useState<BodyZone | null>(null);
  const [editingFragranceId, setEditingFragranceId] = useState<string | null>(
    null,
  );
  const pickerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (pickerTimerRef.current) clearTimeout(pickerTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!activeBalade) {
      startBalade({ mode: "free" });
    } else if (activeBalade.mode !== "free") {
      router.replace("/balade/guided/active");
    }
  }, [activeBalade, startBalade, router]);

  const placements = activeBalade?.placements ?? [];

  const filledMarkers = useMemo(
    () =>
      placements
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
        .filter((m): m is NonNullable<typeof m> => Boolean(m)),
    [placements, fragrances],
  );

  function openPickerDelayed() {
    if (pickerTimerRef.current) {
      clearTimeout(pickerTimerRef.current);
      pickerTimerRef.current = null;
    }
    pickerTimerRef.current = setTimeout(() => {
      setPicker(true);
      pickerTimerRef.current = null;
    }, PICKER_DELAY_MS);
  }

  function handleBodyClick(
    zone: BodyZone,
    position: [number, number, number],
  ) {
    if (pickerTimerRef.current) {
      clearTimeout(pickerTimerRef.current);
      pickerTimerRef.current = null;
    }
    const existingAtZone = placements.filter((p) => p.zone === zone);

    if (editingFragranceId) {
      movePlacement(editingFragranceId, zone, position);
      setEditingFragranceId(null);
      setSelectedZone(zone);
      setSelectedPosition(position);
      return;
    }

    setSelectedZone(zone);
    setSelectedPosition(position);

    if (existingAtZone.length > 0) {
      setConfirmingZone(zone);
    } else {
      setPlacementMode("replace");
      openPickerDelayed();
    }
  }

  function chooseReplace() {
    if (!confirmingZone) return;
    setPlacementMode("replace");
    setConfirmingZone(null);
    openPickerDelayed();
  }

  function chooseLayer() {
    if (!confirmingZone) return;
    setPlacementMode("layer");
    setConfirmingZone(null);
    openPickerDelayed();
  }

  function assign(fragrance: Fragrance) {
    if (!selectedZone) return;
    if (placementMode === "layer") {
      layerOnBody(selectedZone, fragrance.key, selectedPosition ?? undefined);
    } else {
      placeOnBody(selectedZone, fragrance.key, selectedPosition ?? undefined);
    }
    setPlacementMode("replace");
    setPicker(false);
    // Keep selectedZone / selectedPosition so the marker stays highlighted +
    // camera stays focused on the just-placed point.
  }

  function startMove(fragranceId: string) {
    setEditingFragranceId(fragranceId);
    setPicker(false);
    setSelectedZone(null);
  }

  return (
    <div className="px-6 pt-4 pb-12">
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <span className="text-[10px] uppercase tracking-[0.3em] text-outline block mb-2">
            Balade libre
          </span>
          <h1 className="text-3xl font-bold tracking-tighter leading-none">
            Carte du corps
          </h1>
        </div>
        <Link
          href="/balade/end"
          className="text-[10px] uppercase tracking-widest font-bold border-b border-primary pb-0.5"
        >
          Terminer
        </Link>
      </header>

      <p className="text-xs text-on-surface-variant mb-4">
        {editingFragranceId
          ? "Touche un nouveau point sur le corps pour déplacer la pose."
          : "Touche n'importe où sur le corps pour assigner un parfum."}
      </p>

      <section className="bg-surface-container-low border border-outline-variant py-6 mb-8">
        <BodySilhouette
          filledMarkers={filledMarkers}
          highlightedZone={selectedZone}
          onBodyClick={handleBodyClick}
        />
      </section>

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
              const f = fragrances.find((x) => x.key === p.fragranceId);
              if (!f) return null;
              const isEditing = editingFragranceId === f.key;
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
                      <span className="w-9 h-9 bg-primary text-on-primary flex items-center justify-center text-[10px] font-bold font-mono">
                        {fragranceInitials(f.name)}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {f.name}
                        </p>
                        <p className="text-[10px] uppercase tracking-widest text-outline">
                          {BODY_ZONE_LABELS[p.zone]}
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
                        onClick={() => startMove(f.key)}
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

      <section className="flex flex-col gap-2">
        <Link
          href="/search"
          className="w-full py-3 border border-outline-variant rounded-full text-[10px] uppercase tracking-widest font-bold hover:border-primary text-center transition-all flex items-center justify-center gap-2"
        >
          <Icon name="search" size={14} />
          Trouver via Search
        </Link>
        <Link
          href="/scan"
          className="w-full py-3 border border-outline-variant rounded-full text-[10px] uppercase tracking-widest font-bold hover:border-primary text-center transition-all flex items-center justify-center gap-2"
        >
          <Icon name="qr_code_scanner" size={14} />
          Identifier via Scan
        </Link>
      </section>

      {confirmingZone && (
        <LayeringPrompt
          zone={confirmingZone}
          existing={placements
            .filter((p) => p.zone === confirmingZone)
            .map((p) => fragrances.find((f) => f.key === p.fragranceId))
            .filter((f): f is Fragrance => Boolean(f))}
          onReplace={chooseReplace}
          onLayer={chooseLayer}
          onCancel={() => {
            setConfirmingZone(null);
            setSelectedZone(null);
            setSelectedPosition(null);
          }}
        />
      )}

      {picker && selectedZone && (
        <FragrancePickerSheet
          zoneLabel={BODY_ZONE_LABELS[selectedZone]}
          mode={placementMode}
          fragrances={fragrances}
          onPick={assign}
          onClose={() => {
            setPicker(false);
            setPlacementMode("replace");
            // Picker closed without committing → also drop the preview marker
            // by clearing the highlighted zone/position.
            setSelectedZone(null);
            setSelectedPosition(null);
          }}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Layering confirmation modal
 *
 * Shown when the user taps a zone that already holds at least one fragrance.
 * Three outcomes: replace, layer (add on top), or cancel. Layering is a real
 * intent in niche perfumery — we never want to silently overwrite.
 * --------------------------------------------------------------------- */

function LayeringPrompt({
  zone,
  existing,
  onReplace,
  onLayer,
  onCancel,
}: {
  zone: BodyZone;
  existing: Fragrance[];
  onReplace: () => void;
  onLayer: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6 bg-primary/40 backdrop-blur-sm"
      role="dialog"
      aria-modal
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm bg-background border border-outline-variant p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[10px] uppercase tracking-[0.2em] text-outline mb-2">
          Zone occupée
        </p>
        <h3 className="text-2xl font-bold tracking-tight mb-4">
          {BODY_ZONE_LABELS[zone]}
        </h3>
        <p className="text-sm text-on-surface-variant mb-4 leading-relaxed">
          {existing.length === 1
            ? "Cette zone porte déjà :"
            : `Cette zone porte déjà ${existing.length} parfums :`}
        </p>
        <ul className="border-y border-outline-variant/40 py-2 mb-5 max-h-32 overflow-y-auto">
          {existing.map((f) => (
            <li
              key={f.key}
              className="flex items-center gap-3 py-1.5"
            >
              <span className="w-7 h-7 bg-primary text-on-primary flex items-center justify-center text-[9px] font-bold font-mono shrink-0">
                {fragranceInitials(f.name)}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{f.name}</p>
                <p className="text-[10px] uppercase tracking-widest text-outline">
                  {f.brand}
                </p>
              </div>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onLayer}
            className="w-full py-3 bg-primary text-on-primary rounded-full text-xs uppercase tracking-[0.2em] font-bold active:scale-95 transition-transform flex items-center justify-center gap-2"
          >
            <Icon name="layers" size={14} />
            Superposer un nouveau parfum
          </button>
          <button
            type="button"
            onClick={onReplace}
            className="w-full py-3 border border-outline-variant rounded-full text-xs uppercase tracking-[0.2em] font-bold hover:border-primary transition-colors flex items-center justify-center gap-2"
          >
            <Icon name="swap_horiz" size={14} />
            {existing.length === 1
              ? "Remplacer ce parfum"
              : "Tout remplacer"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-full py-2 text-[10px] uppercase tracking-widest text-outline hover:text-on-background transition-colors"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}

function FragrancePickerSheet({
  zoneLabel,
  mode,
  fragrances,
  onPick,
  onClose,
}: {
  zoneLabel: string;
  mode: "replace" | "layer";
  fragrances: Fragrance[];
  onPick: (f: Fragrance) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  // Slide-up animation: render sheet at translate-y-full first, then animate
  // to 0 on next paint.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const filtered = q
    ? fragrances.filter((f) =>
        (f.name + " " + f.brand + " " + (f.tags ?? []).join(" "))
          .toLowerCase()
          .includes(q.toLowerCase()),
      )
    : fragrances;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
    >
      {/* Light overlay: barely-tinted, lets the zoomed 3D body remain visible.
          Tap to close. */}
      <div
        className="absolute inset-0 bg-primary/10 transition-opacity duration-300"
        style={{ opacity: mounted ? 1 : 0 }}
        onClick={onClose}
        aria-hidden
      />
      <div
        className={clsx(
          "relative w-full max-w-screen-md bg-background border-t border-outline-variant max-h-[60vh] flex flex-col safe-bottom shadow-2xl transition-transform duration-300 ease-out",
          mounted ? "translate-y-0" : "translate-y-full",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-5 pb-3 border-b border-outline-variant/40 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-[0.2em] text-outline mb-1 flex items-center gap-1.5">
              {mode === "layer" ? (
                <>
                  <Icon name="layers" size={12} />
                  Superposer à
                </>
              ) : (
                <>Assigner à</>
              )}
            </p>
            <h3 className="text-base font-semibold tracking-tight truncate">
              {zoneLabel}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="text-outline hover:text-on-background flex-shrink-0"
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="px-6 py-3 border-b border-outline-variant/40">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filtrer un parfum…"
            className="w-full bg-transparent border-b border-outline-variant py-2 text-sm focus:outline-none focus:border-primary"
          />
        </div>
        {filtered.length === 0 ? (
          <p className="px-6 py-8 text-xs text-on-surface-variant text-center">
            Aucun parfum dans le catalogue.
          </p>
        ) : (
          <ul className="overflow-y-auto flex-1">
            {filtered.map((f) => (
              <li key={f.key}>
                <button
                  type="button"
                  onClick={() => onPick(f)}
                  className="w-full flex items-center gap-3 px-6 py-3 hover:bg-surface-container-low text-left border-b border-outline-variant/30"
                >
                  <div className="w-12 h-16 bg-surface-container-low overflow-hidden flex-shrink-0">
                    {f.imageUrl && (
                      <img
                        src={f.imageUrl}
                        alt=""
                        className="w-full h-full object-cover grayscale"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] uppercase tracking-[0.15em] text-outline">
                      {f.brand}
                    </p>
                    <p className="text-sm font-medium truncate">{f.name}</p>
                    {f.family && (
                      <p className="text-[10px] uppercase tracking-widest text-outline">
                        {f.family}
                      </p>
                    )}
                  </div>
                  <Icon name="add" size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
