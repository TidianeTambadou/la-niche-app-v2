"use client";

import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { Icon } from "@/components/Icon";
import { openConcierge } from "@/lib/concierge-bus";
import type { PerfumeCardData } from "@/lib/agent";

type Props = {
  open: boolean;
  onClose: () => void;
  card?: PerfumeCardData | null;
  lookup?: { brand: string; name: string };
};

export function PerfumeCardModal({ open, onClose, card, lookup }: Props) {
  const [mounted, setMounted] = useState(false);
  const [imgState, setImgState] = useState<"loading" | "ready" | "error">("loading");
  const [imgObjectUrl, setImgObjectUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  const brand = lookup?.brand ?? card?.brand ?? "";
  const name  = lookup?.name  ?? card?.name  ?? "";

  // Slide-up animation
  useEffect(() => {
    if (!open) { setMounted(false); return; }
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  // Fetch image via JS (not <img src>) so we get the real error message
  useEffect(() => {
    if (!open || !brand || !name) return;
    let cancelled = false;
    setImgState("loading");
    setImgObjectUrl(null);
    setErrorMsg(null);

    const url = `/api/card-image?brand=${encodeURIComponent(brand)}&name=${encodeURIComponent(name)}`;
    fetch(url)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          const txt = await res.text().catch(() => `HTTP ${res.status}`);
          setErrorMsg(txt);
          setImgState("error");
          return;
        }
        const blob = await res.blob();
        if (cancelled) return;
        setImgObjectUrl(URL.createObjectURL(blob));
        setImgState("ready");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setErrorMsg(e instanceof Error ? e.message : "Erreur réseau");
        setImgState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [open, brand, name, retry]);

  // Esc + scroll lock
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Carte ${brand} ${name}`}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
        style={{ opacity: mounted ? 1 : 0 }}
        onClick={onClose}
        aria-hidden
      />

      <article
        className={clsx(
          "relative w-full max-w-sm sm:max-w-md max-h-[92dvh]",
          "bg-[#F5F1EA] shadow-2xl flex flex-col",
          "transition-transform transition-opacity duration-400 ease-out",
          mounted
            ? "translate-y-0 opacity-100"
            : "translate-y-full sm:translate-y-6 opacity-0",
        )}
      >
        {/* Top bar */}
        <header className="px-4 py-3 flex items-center justify-between gap-3 border-b border-black/10 flex-shrink-0 bg-[#F5F1EA]">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-stone-500">
            <Icon name="local_florist" size={12} />
            Carte La Niche
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="w-8 h-8 flex items-center justify-center text-stone-400 hover:text-black transition-colors"
          >
            <Icon name="close" size={20} />
          </button>
        </header>

        {/* Image area */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {!brand || !name ? (
            <NoTarget onAskConcierge={() => { openConcierge({}); onClose(); }} />
          ) : (
            <div className="relative">
              {/* Loading */}
              {imgState === "loading" && (
                <div className="flex flex-col items-center justify-center gap-4 bg-[#F5F1EA] min-h-[420px]">
                  <div className="w-10 h-10 rounded-full overflow-hidden border border-stone-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/logo-laniche.png" alt="" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-5 h-5 border-2 border-stone-400 border-t-transparent rounded-full animate-spin" />
                    <p className="text-[11px] uppercase tracking-widest text-stone-400 mt-1">
                      Génération en cours…
                    </p>
                    <p className="text-[10px] text-stone-400">~30 secondes</p>
                  </div>
                </div>
              )}

              {/* Error */}
              {imgState === "error" && (
                <div className="flex flex-col items-center justify-center gap-3 py-10 px-6 text-center min-h-[300px]">
                  <Icon name="broken_image" size={32} className="text-stone-300" />
                  <p className="text-sm text-stone-500">Impossible de générer la carte.</p>
                  {errorMsg && (
                    <p className="text-[10px] text-red-500 font-mono max-w-xs break-all leading-snug">
                      {errorMsg}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => { setErrorMsg(null); setRetry((r) => r + 1); }}
                    className="text-[10px] uppercase tracking-widest font-bold border border-stone-400 px-4 py-2 hover:bg-stone-100 transition-colors"
                  >
                    Réessayer
                  </button>
                </div>
              )}

              {/* AI-generated poster */}
              {imgState === "ready" && imgObjectUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={imgObjectUrl}
                  alt={`Carte ${brand} ${name}`}
                  className="w-full h-auto block"
                />
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="px-4 py-3 border-t border-black/10 flex items-center justify-between gap-3 flex-shrink-0 bg-[#F5F1EA]">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-laniche.png" alt="" className="w-5 h-5 rounded-full object-cover" />
            <span className="text-[9px] uppercase tracking-[0.3em] text-stone-400 font-mono">
              by La Niche
            </span>
          </div>
          {imgState === "ready" && imgObjectUrl && (
            <DownloadButton brand={brand} name={name} objectUrl={imgObjectUrl} />
          )}
        </footer>
      </article>
    </div>
  );
}

/* ─── Download button ────────────────────────────────────────────────── */

function DownloadButton({ brand, name, objectUrl }: { brand: string; name: string; objectUrl: string }) {
  function download() {
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = `laniche-${slug(brand)}-${slug(name)}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <button
      type="button"
      onClick={download}
      className="text-[10px] uppercase tracking-widest font-bold flex items-center gap-1.5 px-3 py-1.5 border border-stone-400 hover:border-black transition-colors"
    >
      <Icon name="download" size={12} />
      Télécharger
    </button>
  );
}

/* ─── Empty state ────────────────────────────────────────────────────── */

function NoTarget({ onAskConcierge }: { onAskConcierge: () => void }) {
  return (
    <div className="p-8 flex flex-col items-center gap-4 text-center">
      <Icon name="image_search" size={36} className="text-stone-300" />
      <p className="text-sm text-stone-500">Parfum non identifié.</p>
      <button
        type="button"
        onClick={onAskConcierge}
        className="text-[10px] uppercase tracking-widest font-bold px-4 py-2 bg-black text-white flex items-center gap-2"
      >
        <Icon name="forum" size={12} />
        Demander à la conciergerie
      </button>
    </div>
  );
}

/* ─── Helpers ────────────────────────────────────────────────────────── */

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}
