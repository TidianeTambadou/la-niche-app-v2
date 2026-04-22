"use client";

import { useEffect, useMemo, useState } from "react";
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

export default function FreeBaladePage() {
  const router = useRouter();
  const fragrances = useFragrances();
  const {
    activeBalade,
    startBalade,
    placeOnBody,
    movePlacement,
    removePlacement,
  } = useStore();

  const [selectedZone, setSelectedZone] = useState<BodyZone | null>(null);
  const [picker, setPicker] = useState(false);
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

  const filledZones = useMemo(() => {
    const map: Partial<Record<BodyZone, string>> = {};
    for (const p of placements) {
      const f = fragrances.find((x) => x.key === p.fragranceId);
      if (f) map[p.zone] = fragranceInitials(f.name);
    }
    return map;
  }, [placements, fragrances]);

  function handleZoneClick(zone: BodyZone) {
    const existing = placements.find((p) => p.zone === zone);
    if (existing) {
      setSelectedZone(zone);
      setEditingFragranceId(existing.fragranceId);
      setPicker(false);
    } else if (editingFragranceId) {
      movePlacement(editingFragranceId, zone);
      setEditingFragranceId(null);
      setSelectedZone(zone);
    } else {
      setSelectedZone(zone);
      setPicker(true);
      setEditingFragranceId(null);
    }
  }

  function assign(fragrance: Fragrance) {
    if (!selectedZone) return;
    placeOnBody(selectedZone, fragrance.key);
    setPicker(false);
  }

  function startMove(fragranceId: string) {
    setEditingFragranceId(fragranceId);
    setPicker(false);
    setSelectedZone(null);
  }

  function remove(fragranceId: string) {
    removePlacement(fragranceId);
    setEditingFragranceId(null);
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
          ? "Touche une zone libre pour déplacer la pose."
          : "Touche une zone du corps pour assigner un parfum."}
      </p>

      <section className="bg-surface-container-low border border-outline-variant py-6 mb-8">
        <BodySilhouette
          filledZones={filledZones}
          highlightedZone={selectedZone}
          onZoneClick={handleZoneClick}
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
              return (
                <li
                  key={p.fragranceId}
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
                        onClick={() => remove(f.key)}
                        className="p-2 hover:text-error transition-colors"
                        aria-label="Supprimer"
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

      {picker && selectedZone && (
        <FragrancePickerSheet
          zoneLabel={BODY_ZONE_LABELS[selectedZone]}
          fragrances={fragrances}
          onPick={assign}
          onClose={() => setPicker(false)}
        />
      )}
    </div>
  );
}

function FragrancePickerSheet({
  zoneLabel,
  fragrances,
  onPick,
  onClose,
}: {
  zoneLabel: string;
  fragrances: Fragrance[];
  onPick: (f: Fragrance) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const filtered = q
    ? fragrances.filter((f) =>
        (f.name + " " + f.brand + " " + (f.tags ?? []).join(" "))
          .toLowerCase()
          .includes(q.toLowerCase()),
      )
    : fragrances;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-primary/40 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-screen-md bg-background border-t border-outline-variant max-h-[80vh] flex flex-col safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-5 pb-3 border-b border-outline-variant/40 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-outline mb-1">
              Assigner à
            </p>
            <h3 className="text-base font-semibold tracking-tight">
              {zoneLabel}
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
