"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Fragrance } from "@/lib/fragrances";
import { useStore } from "@/lib/store";
import { Icon } from "@/components/Icon";

type Props = {
  fragrance: Fragrance;
  open: boolean;
  onClose: () => void;
};

/**
 * Bottom action sheet shown when the user taps "Balade" on a perfume card.
 * - If a balade is active: lets them place the perfume on a body zone (handled
 *   from the Free balade screen) or simply add it to the tested list.
 * - If no balade is active: offers to start a Free balade with this perfume.
 */
export function AddToBaladeSheet({ fragrance, open, onClose }: Props) {
  const router = useRouter();
  const { activeBalade, startBalade, recordTest } = useStore();

  // Close on escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const hasActive = Boolean(activeBalade);

  function startFreeWith() {
    startBalade({ mode: "free" });
    recordTest(fragrance.id, null);
    onClose();
    router.push("/balade/free");
  }

  function addToActive() {
    recordTest(fragrance.id, null);
    onClose();
    if (activeBalade?.mode === "free") {
      router.push("/balade/free");
    } else {
      router.push("/balade/guided/active");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-primary/40 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Ajouter à une balade"
    >
      <div
        className="w-full max-w-screen-md bg-background border-t border-outline-variant safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-6 pb-4 flex items-start justify-between gap-4 border-b border-outline-variant/40">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-outline mb-1">
              Ajouter à une balade
            </p>
            <h3 className="text-lg font-semibold tracking-tight">
              {fragrance.name}
            </h3>
            <p className="text-xs text-on-surface-variant mt-0.5">
              {fragrance.brand}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="text-outline hover:text-on-background active:scale-95 transition-all"
          >
            <Icon name="close" />
          </button>
        </div>

        <div className="px-6 py-6 flex flex-col gap-3">
          {hasActive ? (
            <>
              <button
                type="button"
                onClick={addToActive}
                className="w-full py-4 bg-primary text-on-primary rounded-full text-xs uppercase tracking-[0.2em] font-bold active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <Icon name="add" size={16} />
                Ajouter à la balade en cours
              </button>
              <p className="text-[11px] text-outline text-center">
                Tu pourras le placer sur le corps depuis la balade.
              </p>
            </>
          ) : (
            <button
              type="button"
              onClick={startFreeWith}
              className="w-full py-4 bg-primary text-on-primary rounded-full text-xs uppercase tracking-[0.2em] font-bold active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <Icon name="directions_walk" size={16} />
              Démarrer une balade libre
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              onClose();
              router.push("/balade");
            }}
            className="w-full py-4 border border-outline-variant rounded-full text-xs uppercase tracking-[0.2em] font-bold hover:border-primary active:scale-95 transition-all"
          >
            Voir les types de balades
          </button>
        </div>
      </div>
    </div>
  );
}
