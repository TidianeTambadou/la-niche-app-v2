"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { useFragrances, type Fragrance } from "@/lib/data";
import { useStore } from "@/lib/store";
import { agentIdentify } from "@/lib/agent-client";
import type { IdentifyResult } from "@/lib/agent";

type Stage = "intro" | "camera" | "scanning" | "result" | "no-match" | "error";

/** What we got back: either the identified perfume matched our local catalog
 *  (full wishlist support), or an external Fragrantica pick we display read-
 *  only with a link out. */
type Identified =
  | { kind: "matched"; fragrance: Fragrance; agent: IdentifyResult }
  | { kind: "external"; agent: IdentifyResult };

export default function ScanPage() {
  const fragrances = useFragrances();
  const [stage, setStage] = useState<Stage>("intro");
  const [identified, setIdentified] = useState<Identified | null>(null);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const { addToWishlist } = useStore();

  useEffect(() => () => stopCamera(), []);

  async function startCamera() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // play() can reject on some mobile browsers even with muted+autoPlay;
        // the video still streams via autoPlay attribute so we swallow the error.
        await videoRef.current.play().catch(() => {});
      }
      setStage("camera");
    } catch (e) {
      console.warn("Camera unavailable:", e);
      setError(
        "Caméra indisponible. Autorise l'accès dans les réglages du navigateur.",
      );
      setStage("error");
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  async function captureAndIdentify() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setError("La caméra n'est pas prête. Réessaie.");
      return;
    }

    setStage("scanning");
    setError(null);

    // Downscale to a 768px max edge — large enough for Claude to read the
    // label, small enough to keep the request <300 KB and snappy.
    const MAX_EDGE = 768;
    const ratio = Math.min(
      1,
      MAX_EDGE / Math.max(video.videoWidth, video.videoHeight),
    );
    const w = Math.round(video.videoWidth * ratio);
    const h = Math.round(video.videoHeight * ratio);

    const canvas = canvasRef.current ?? document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setError("Impossible de capturer l'image (canvas indisponible).");
      setStage("camera");
      return;
    }
    ctx.drawImage(video, 0, 0, w, h);
    // 0.85 quality is the sweet spot for label legibility vs payload size.
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    const base64 = dataUrl.split(",")[1] ?? "";

    if (!base64) {
      setError("Impossible d'encoder l'image capturée.");
      setStage("camera");
      return;
    }

    try {
      const result = await agentIdentify(base64, "image/jpeg");
      stopCamera();
      if (!result) {
        setStage("no-match");
        return;
      }
      const matched = matchToCatalog(result, fragrances);
      setIdentified(
        matched
          ? { kind: "matched", fragrance: matched, agent: result }
          : { kind: "external", agent: result },
      );
      setStage("result");
    } catch (e) {
      console.error("agentIdentify failed:", e);
      setError(
        e instanceof Error
          ? e.message
          : "L'agent IA n'a pas pu analyser l'image.",
      );
      setStage("error");
    }
  }

  function recordFeedback(liked: boolean) {
    if (identified?.kind !== "matched") return;
    addToWishlist(
      identified.fragrance.key,
      liked ? "liked" : "disliked",
      "scan",
    );
  }

  function reset() {
    setIdentified(null);
    setError(null);
    setStage("intro");
  }

  return (
    <div className="px-6 pt-4 pb-12">
      <header className="mb-8">
        <span className="text-[10px] uppercase tracking-[0.3em] text-outline mb-3 block">
          Reconnaissance IA
        </span>
        <h1 className="text-4xl font-bold tracking-tighter leading-none">
          Scan parfum
        </h1>
      </header>

      {/* Hidden canvas reused across captures. */}
      <canvas ref={canvasRef} className="hidden" />

      {stage === "intro" && (
        <section className="flex flex-col gap-8">
          <div className="aspect-square bg-surface-container-low border border-outline-variant flex items-center justify-center">
            <div className="text-center px-6">
              <Icon
                name="document_scanner"
                size={56}
                className="text-on-surface-variant mb-4 mx-auto"
              />
              <p className="text-sm text-on-surface-variant max-w-xs mx-auto leading-relaxed">
                Pointe la caméra sur un flacon ou son packaging.
                L&apos;agent IA identifie le parfum à partir de l&apos;image.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={startCamera}
            className="w-full py-4 bg-primary text-on-primary rounded-full text-xs uppercase tracking-[0.2em] font-bold active:scale-95 transition-transform flex items-center justify-center gap-2"
          >
            <Icon name="photo_camera" size={16} />
            Ouvrir la caméra
          </button>
          <p className="text-[10px] uppercase tracking-widest text-outline text-center leading-relaxed">
            L&apos;image capturée est envoyée à l&apos;agent IA pour
            identification (Fragrantica).
          </p>
        </section>
      )}

      {(stage === "camera" || stage === "scanning") && (
        <section className="flex flex-col gap-6">
          <div className="relative aspect-square bg-on-background overflow-hidden">
            <video
              ref={videoRef}
              playsInline
              autoPlay
              muted
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-2/3 aspect-square border border-on-primary/80 relative">
                <Corner pos="top-left" />
                <Corner pos="top-right" />
                <Corner pos="bottom-left" />
                <Corner pos="bottom-right" />
              </div>
            </div>
            {stage === "scanning" && (
              <div className="absolute inset-0 bg-primary/40 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="flex gap-1">
                    <Dot delay={0} />
                    <Dot delay={150} />
                    <Dot delay={300} />
                  </div>
                  <span className="text-[10px] uppercase tracking-widest font-mono text-on-primary">
                    L&apos;agent analyse l&apos;image…
                  </span>
                </div>
              </div>
            )}
            <div className="absolute top-3 left-3">
              <span className="text-[10px] uppercase tracking-widest font-mono bg-background/80 px-2 py-1 border border-outline-variant">
                {stage === "scanning" ? "ANALYSE…" : "CADRE LE FLACON"}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={captureAndIdentify}
            disabled={stage === "scanning"}
            className="w-full py-4 bg-primary text-on-primary rounded-full text-xs uppercase tracking-[0.2em] font-bold active:scale-95 transition-transform flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Icon name="center_focus_strong" size={16} />
            {stage === "scanning" ? "Analyse en cours" : "Capturer"}
          </button>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              setStage("intro");
            }}
            disabled={stage === "scanning"}
            className="w-full py-3 border border-outline-variant rounded-full text-[10px] uppercase tracking-widest font-bold hover:border-primary transition-all disabled:opacity-40"
          >
            Annuler
          </button>
        </section>
      )}

      {stage === "no-match" && (
        <section className="flex flex-col gap-6 text-center py-8">
          <Icon
            name="search_off"
            size={48}
            className="text-outline mx-auto"
          />
          <div>
            <p className="text-base font-semibold mb-2">
              Aucun parfum identifié
            </p>
            <p className="text-sm text-on-surface-variant max-w-sm mx-auto leading-relaxed">
              L&apos;agent n&apos;a pas pu reconnaître ce flacon avec assez
              de certitude. Essaie avec un meilleur cadrage, une étiquette
              lisible, ou plus de lumière.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={startCamera}
              className="w-full py-4 bg-primary text-on-primary rounded-full text-xs uppercase tracking-[0.2em] font-bold active:scale-95 transition-transform flex items-center justify-center gap-2"
            >
              <Icon name="photo_camera" size={16} />
              Réessayer
            </button>
            <button
              type="button"
              onClick={reset}
              className="w-full py-3 text-[10px] uppercase tracking-widest font-bold text-outline hover:text-on-background transition-colors"
            >
              Retour
            </button>
          </div>
        </section>
      )}

      {stage === "error" && (
        <section className="flex flex-col gap-6 text-center py-8">
          <Icon
            name="error_outline"
            size={48}
            className="text-error mx-auto"
          />
          <div>
            <p className="text-base font-semibold mb-2">
              Une erreur est survenue
            </p>
            <p className="text-sm text-on-surface-variant max-w-sm mx-auto leading-relaxed">
              {error ?? "Erreur inconnue."}
            </p>
          </div>
          <button
            type="button"
            onClick={reset}
            className="w-full py-4 bg-primary text-on-primary rounded-full text-xs uppercase tracking-[0.2em] font-bold active:scale-95 transition-transform"
          >
            Recommencer
          </button>
        </section>
      )}

      {stage === "result" && identified && (
        <ScanResult
          identified={identified}
          onLike={() => recordFeedback(true)}
          onDislike={() => recordFeedback(false)}
          onReset={reset}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Catalog matching — try to map the agent's "name + brand" to a Fragrance
 * we already have in stock so the user can wishlist / view the detail page.
 * Falls back to external display if no match.
 * --------------------------------------------------------------------- */

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function matchToCatalog(
  agent: IdentifyResult,
  fragrances: Fragrance[],
): Fragrance | null {
  const target = `${normalize(agent.brand)} ${normalize(agent.name)}`.trim();
  if (!target) return null;
  // 1) Exact-ish match on (brand + name).
  for (const f of fragrances) {
    const candidate = `${normalize(f.brand)} ${normalize(f.name)}`.trim();
    if (candidate === target) return f;
  }
  // 2) Same brand + name token-subset match (handles "Aventus" vs
  //    "Aventus Eau de Parfum" type drift).
  const targetTokens = new Set(target.split(" ").filter(Boolean));
  let best: { f: Fragrance; score: number } | null = null;
  for (const f of fragrances) {
    const candidate = `${normalize(f.brand)} ${normalize(f.name)}`.trim();
    const candTokens = candidate.split(" ").filter(Boolean);
    const overlap = candTokens.filter((t) => targetTokens.has(t)).length;
    const score = overlap / Math.max(candTokens.length, targetTokens.size);
    if (score > 0.6 && (!best || score > best.score)) best = { f, score };
  }
  return best?.f ?? null;
}

/* -------------------------------------------------------------------------
 * Result view — branches on matched vs external.
 * --------------------------------------------------------------------- */

function ScanResult({
  identified,
  onLike,
  onDislike,
  onReset,
}: {
  identified: Identified;
  onLike: () => void;
  onDislike: () => void;
  onReset: () => void;
}) {
  const [given, setGiven] = useState<"liked" | "disliked" | null>(null);
  const { agent } = identified;
  const confidencePct = Math.round((agent.confidence ?? 0) * 100);
  const lowConfidence = confidencePct < 60;

  // Display fields prefer the catalog entry when matched (canonical naming
  // / image), fall back to the agent's report when external.
  const displayName =
    identified.kind === "matched" ? identified.fragrance.name : agent.name;
  const displayBrand =
    identified.kind === "matched" ? identified.fragrance.brand : agent.brand;
  const displayImage =
    identified.kind === "matched" ? identified.fragrance.imageUrl : null;
  const displayReference =
    identified.kind === "matched"
      ? identified.fragrance.reference
      : "FRAGRANTICA";

  return (
    <section className="flex flex-col gap-6">
      <div className="relative aspect-[4/5] bg-surface-container-low overflow-hidden">
        {displayImage ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={displayImage}
            alt={displayName}
            className="w-full h-full object-cover grayscale contrast-110"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-outline">
            <Icon name="image_not_supported" size={48} />
          </div>
        )}
        <div className="absolute top-3 left-3">
          <span className="text-[10px] uppercase tracking-widest font-mono bg-background/90 px-2 py-1 border border-outline-variant">
            REF: {displayReference}
          </span>
        </div>
        <div className="absolute top-3 right-3">
          <span
            className={`text-[10px] uppercase tracking-widest font-mono px-2 py-1 ${
              lowConfidence
                ? "bg-error/80 text-on-primary"
                : "bg-primary text-on-primary"
            }`}
          >
            MATCH {confidencePct}%
          </span>
        </div>
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-[0.2em] text-outline">
          {displayBrand}
        </p>
        <h2 className="text-3xl font-bold tracking-tight">{displayName}</h2>
        {agent.notes_brief && (
          <p className="text-sm text-on-surface-variant mt-3 max-w-md leading-relaxed">
            {agent.notes_brief}
          </p>
        )}
        {identified.kind === "external" && (
          <p className="text-[10px] uppercase tracking-widest text-outline mt-3">
            Hors catalogue — fiche externe
          </p>
        )}
        {lowConfidence && (
          <p className="text-[11px] text-error mt-3 border border-error/40 px-3 py-2">
            Confiance faible — vérifie sur Fragrantica avant de te fier au
            résultat.
          </p>
        )}
      </div>

      {identified.kind === "matched" ? (
        !given ? (
          <div className="border-y border-outline-variant py-6 flex flex-col gap-4">
            <p className="text-center text-sm font-medium">
              Tu aimes ce parfum ?
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  onDislike();
                  setGiven("disliked");
                }}
                className="py-4 border border-outline-variant rounded-full text-xs uppercase tracking-widest font-bold hover:border-error hover:text-error active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <Icon name="thumb_down" size={16} />
                Non
              </button>
              <button
                type="button"
                onClick={() => {
                  onLike();
                  setGiven("liked");
                }}
                className="py-4 bg-primary text-on-primary rounded-full text-xs uppercase tracking-widest font-bold active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <Icon name="thumb_up" size={16} />
                Oui
              </button>
            </div>
          </div>
        ) : (
          <div className="border-y border-outline-variant py-6 text-center">
            <Icon
              name={given === "liked" ? "favorite" : "block"}
              filled={given === "liked"}
              size={28}
              className="mx-auto mb-2"
            />
            <p className="text-xs uppercase tracking-widest font-bold">
              {given === "liked"
                ? "Ajouté à la wishlist (Liked)"
                : "Marqué Disliked"}
            </p>
          </div>
        )
      ) : (
        <div className="border-y border-outline-variant py-6 text-center">
          <p className="text-xs text-on-surface-variant max-w-xs mx-auto leading-relaxed">
            Ce parfum n&apos;est pas (encore) dans le stock des boutiques
            référencées.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {identified.kind === "matched" ? (
          <Link
            href={`/fragrance/${identified.fragrance.key}`}
            className="w-full py-4 border border-outline-variant rounded-full text-xs uppercase tracking-[0.2em] font-bold hover:border-primary text-center active:scale-95 transition-all"
          >
            Voir le détail
          </Link>
        ) : (
          <a
            href={agent.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-4 border border-outline-variant rounded-full text-xs uppercase tracking-[0.2em] font-bold hover:border-primary text-center active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <Icon name="open_in_new" size={14} />
            Voir sur Fragrantica
          </a>
        )}
        <button
          type="button"
          onClick={onReset}
          className="w-full py-3 text-[10px] uppercase tracking-widest font-bold text-outline hover:text-on-background transition-colors"
        >
          Scanner un autre parfum
        </button>
      </div>
    </section>
  );
}

function Corner({
  pos,
}: {
  pos: "top-left" | "top-right" | "bottom-left" | "bottom-right";
}) {
  const baseStyle = "absolute w-6 h-6 border-on-primary";
  const variants: Record<typeof pos, string> = {
    "top-left": "top-0 left-0 border-t-2 border-l-2",
    "top-right": "top-0 right-0 border-t-2 border-r-2",
    "bottom-left": "bottom-0 left-0 border-b-2 border-l-2",
    "bottom-right": "bottom-0 right-0 border-b-2 border-r-2",
  };
  return <div className={`${baseStyle} ${variants[pos]}`} />;
}

function Dot({ delay }: { delay: number }) {
  return (
    <span
      className="w-2 h-2 bg-on-primary rounded-full animate-pulse"
      style={{ animationDelay: `${delay}ms` }}
    />
  );
}
