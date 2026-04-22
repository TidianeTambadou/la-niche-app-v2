"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import {
  BODY_ZONE_LABELS,
  type BodyZone,
} from "@/lib/fragrances";
import { useFragrances, type Fragrance } from "@/lib/data";
import { useStore } from "@/lib/store";
import {
  BodySilhouette,
  fragranceInitials,
} from "@/components/BodySilhouette";

export default function GuidedActivePage() {
  const router = useRouter();
  const fragrances = useFragrances();
  const {
    activeBalade,
    recordTest,
    advanceRoute,
    placeOnBody,
    removePlacement,
  } = useStore();
  const [zonePicker, setZonePicker] = useState(false);
  const [step, setStep] = useState<"smell" | "feedback" | "place">("smell");

  useEffect(() => {
    if (!activeBalade) {
      router.replace("/balade/guided");
      return;
    }
    if (activeBalade.mode !== "guided") {
      router.replace("/balade/free");
    }
  }, [activeBalade, router]);

  if (!activeBalade || activeBalade.mode !== "guided") return null;

  const currentId = activeBalade.route[activeBalade.routeIndex];
  const current = currentId
    ? fragrances.find((f) => f.key === currentId)
    : null;
  const total = activeBalade.route.length;
  const isLast = activeBalade.routeIndex >= total - 1;

  const placement = current
    ? activeBalade.placements.find((p) => p.fragranceId === current.key)
    : null;

  function next() {
    if (isLast) {
      router.push("/balade/end");
    } else {
      advanceRoute();
      setStep("smell");
      setZonePicker(false);
    }
  }

  function feedback(value: "liked" | "disliked") {
    if (!current) return;
    recordTest(current.key, value);
    setStep("place");
  }

  function pickZone(zone: BodyZone, position: [number, number, number]) {
    if (!current) return;
    placeOnBody(zone, current.key, position);
    setZonePicker(false);
  }

  function skipPlace() {
    setZonePicker(false);
  }

  if (!current) {
    return (
      <div className="px-6 pt-12 text-center">
        <p className="text-sm text-on-surface-variant mb-6">
          Le parcours est vide ou les parfums ne sont plus disponibles.
        </p>
        <button
          type="button"
          onClick={() => router.push("/balade/end")}
          className="px-6 py-3 bg-primary text-on-primary rounded-full text-[10px] uppercase tracking-widest font-bold"
        >
          Voir le résumé
        </button>
      </div>
    );
  }

  return (
    <div className="px-6 pt-4 pb-12">
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <span className="text-[10px] uppercase tracking-[0.3em] text-outline block mb-2">
            Balade guidée ·{" "}
            {String(activeBalade.routeIndex + 1).padStart(2, "0")}/
            {String(total).padStart(2, "0")}
          </span>
          <h1 className="text-3xl font-bold tracking-tighter leading-none">
            {current.name}
          </h1>
        </div>
        <button
          type="button"
          onClick={() => router.push("/balade/end")}
          className="text-[10px] uppercase tracking-widest font-bold border-b border-primary pb-0.5"
        >
          Terminer
        </button>
      </header>

      <div className="h-px bg-outline-variant mb-1">
        <div
          className="h-px bg-primary transition-all duration-300"
          style={{
            width: `${((activeBalade.routeIndex + 1) / total) * 100}%`,
          }}
        />
      </div>
      <p className="text-[10px] uppercase tracking-widest text-outline mb-8">
        Étape {activeBalade.routeIndex + 1} sur {total}
      </p>

      <section className="mb-6">
        <div className="relative aspect-[4/5] bg-surface-container-low overflow-hidden">
          {current.imageUrl && (
            <img
              src={current.imageUrl}
              alt={current.name}
              className="w-full h-full object-cover grayscale contrast-110"
            />
          )}
          <div className="absolute top-3 left-3">
            <span className="text-[10px] uppercase tracking-widest font-mono bg-background/90 px-2 py-1 border border-outline-variant">
              REF: {current.reference}
            </span>
          </div>
        </div>
        <div className="mt-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-outline">
            {current.brand}
          </p>
          <h2 className="text-2xl font-bold tracking-tight">{current.name}</h2>
          {current.description && (
            <p className="text-sm text-on-surface-variant mt-2 leading-relaxed">
              {current.description}
            </p>
          )}
        </div>
      </section>

      {step === "smell" && (
        <section className="border-y border-outline-variant py-6 mb-6 text-center">
          <Icon
            name="air"
            size={36}
            className="mx-auto mb-3 text-on-surface-variant"
          />
          <p className="text-sm font-medium mb-2">Sens-le.</p>
          <p className="text-xs text-on-surface-variant max-w-xs mx-auto mb-5">
            Approche la mouillette ou le flacon. Prends ton temps.
          </p>
          <button
            type="button"
            onClick={() => setStep("feedback")}
            className="px-8 py-3 bg-primary text-on-primary rounded-full text-[10px] uppercase tracking-widest font-bold active:scale-95 transition-all"
          >
            J&apos;ai senti
          </button>
        </section>
      )}

      {step === "feedback" && (
        <section className="border-y border-outline-variant py-6 mb-6">
          <p className="text-center text-sm font-medium mb-4">
            Premier ressenti ?
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => feedback("disliked")}
              className="py-4 border border-outline-variant rounded-full text-xs uppercase tracking-widest font-bold hover:border-error hover:text-error active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <Icon name="thumb_down" size={16} />
              Non
            </button>
            <button
              type="button"
              onClick={() => feedback("liked")}
              className="py-4 bg-primary text-on-primary rounded-full text-xs uppercase tracking-widest font-bold active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <Icon name="thumb_up" size={16} />
              Oui
            </button>
          </div>
        </section>
      )}

      {step === "place" && (
        <section className="border-y border-outline-variant py-6 mb-6">
          <p className="text-center text-sm font-medium mb-4">
            Le poser sur le corps ?
          </p>
          {placement ? (
            <div className="flex items-center justify-between border border-outline-variant px-4 py-3 mb-4">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-outline mb-0.5">
                  Posé sur
                </p>
                <p className="text-sm font-medium">
                  {BODY_ZONE_LABELS[placement.zone]}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setZonePicker(true)}
                  className="text-[10px] uppercase tracking-widest font-bold border-b border-primary pb-0.5"
                >
                  Déplacer
                </button>
                <button
                  type="button"
                  onClick={() => removePlacement(current.key)}
                  className="text-outline hover:text-error"
                  aria-label="Retirer la pose"
                >
                  <Icon name="delete_outline" size={16} />
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 mb-4">
              <button
                type="button"
                onClick={skipPlace}
                className="py-4 border border-outline-variant rounded-full text-xs uppercase tracking-widest font-bold hover:border-primary active:scale-95 transition-all"
              >
                Passer
              </button>
              <button
                type="button"
                onClick={() => setZonePicker(true)}
                className="py-4 bg-primary text-on-primary rounded-full text-xs uppercase tracking-widest font-bold active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <Icon name="my_location" size={14} />
                Choisir zone
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={next}
            className="w-full py-4 border border-primary rounded-full text-xs uppercase tracking-[0.2em] font-bold hover:bg-primary hover:text-on-primary active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            {isLast ? "Terminer la balade" : "Parfum suivant"}
            <Icon name="arrow_forward" size={16} />
          </button>
        </section>
      )}

      {zonePicker && current && (
        <ZonePickerSheet
          fragrance={current}
          existingPlacements={activeBalade.placements}
          fragrances={fragrances}
          onPick={pickZone}
          onClose={() => setZonePicker(false)}
        />
      )}
    </div>
  );
}

function ZonePickerSheet({
  fragrance,
  existingPlacements,
  fragrances,
  onPick,
  onClose,
}: {
  fragrance: Fragrance;
  existingPlacements: {
    zone: BodyZone;
    fragranceId: string;
    position?: [number, number, number];
  }[];
  fragrances: Fragrance[];
  onPick: (zone: BodyZone, position: [number, number, number]) => void;
  onClose: () => void;
}) {
  const filledMarkers = existingPlacements
    .filter((p) => p.fragranceId !== fragrance.key)
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-primary/40 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-screen-md bg-background border-t border-outline-variant safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-5 pb-3 border-b border-outline-variant/40 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-outline mb-1">
              Poser sur
            </p>
            <h3 className="text-base font-semibold tracking-tight">
              {fragrance.name}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="text-outline hover:text-on-background"
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="px-6 py-6">
          <BodySilhouette
            filledMarkers={filledMarkers}
            onBodyClick={onPick}
          />
          <p className="text-center text-[10px] uppercase tracking-widest text-outline mt-2">
            Touche n&apos;importe où sur le corps
          </p>
        </div>
      </div>
    </div>
  );
}
