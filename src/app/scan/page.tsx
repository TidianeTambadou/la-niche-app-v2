"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { useFragrances, type Fragrance } from "@/lib/data";
import { useStore } from "@/lib/store";

type Stage = "intro" | "camera" | "scanning" | "result" | "no-data";

export default function ScanPage() {
  const fragrances = useFragrances();
  const [stage, setStage] = useState<Stage>("intro");
  const [result, setResult] = useState<Fragrance | null>(null);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const { addToWishlist } = useStore();

  useEffect(() => () => stopCamera(), []);

  async function startCamera() {
    setError(null);
    if (fragrances.length === 0) {
      setStage("no-data");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStage("camera");
    } catch (e) {
      console.warn("Camera unavailable:", e);
      setError(
        "Caméra indisponible. Vérifie les permissions ou démo : capture en simulation.",
      );
      setStage("camera");
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
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
    }, 1400);
  }

  function recordFeedback(liked: boolean) {
    if (!result) return;
    addToWishlist(result.key, liked ? "liked" : "disliked", "scan");
  }

  function reset() {
    setResult(null);
    setStage("intro");
  }

  return (
    <div className="px-6 pt-4 pb-12">
      <header className="mb-8">
        <span className="text-[10px] uppercase tracking-[0.3em] text-outline mb-3 block">
          Reconnaissance
        </span>
        <h1 className="text-4xl font-bold tracking-tighter leading-none">
          Scan parfum
        </h1>
      </header>

      {stage === "intro" && (
        <section className="flex flex-col gap-8">
          <div className="aspect-square bg-surface-container-low border border-outline-variant flex items-center justify-center">
            <div className="text-center px-6">
              <Icon
                name="qr_code_scanner"
                size={56}
                className="text-on-surface-variant mb-4 mx-auto"
              />
              <p className="text-sm text-on-surface-variant max-w-xs mx-auto">
                Pointe ton appareil sur un flacon. La reconnaissance s&apos;active
                à la capture.
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
          <p className="text-[10px] uppercase tracking-widest text-outline text-center">
            La caméra reste sur l&apos;appareil. Aucune image n&apos;est envoyée.
          </p>
        </section>
      )}

      {stage === "no-data" && (
        <section className="flex flex-col gap-6 text-center py-12">
          <Icon
            name="inventory_2"
            size={48}
            className="text-outline mx-auto"
          />
          <p className="text-sm text-on-surface-variant max-w-sm mx-auto">
            Aucun parfum dans le catalogue. Ajoute du stock dans le CRM pour
            tester la reconnaissance.
          </p>
          <Link
            href="/"
            className="text-[10px] uppercase tracking-widest font-bold border-b border-primary pb-0.5 inline-block mx-auto"
          >
            Retour à l&apos;accueil
          </Link>
        </section>
      )}

      {(stage === "camera" || stage === "scanning") && (
        <section className="flex flex-col gap-6">
          <div className="relative aspect-square bg-on-background overflow-hidden">
            <video
              ref={videoRef}
              playsInline
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
                <div className="flex gap-1">
                  <Dot delay={0} />
                  <Dot delay={150} />
                  <Dot delay={300} />
                </div>
              </div>
            )}
            <div className="absolute top-3 left-3">
              <span className="text-[10px] uppercase tracking-widest font-mono bg-background/80 px-2 py-1 border border-outline-variant">
                {stage === "scanning" ? "ANALYSE…" : "CADRE LE FLACON"}
              </span>
            </div>
          </div>

          {error && (
            <p className="text-[11px] text-error border border-error/40 px-3 py-2">
              {error}
            </p>
          )}

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
            className="w-full py-3 border border-outline-variant rounded-full text-[10px] uppercase tracking-widest font-bold hover:border-primary transition-all"
          >
            Annuler
          </button>
        </section>
      )}

      {stage === "result" && result && (
        <ScanResult
          fragrance={result}
          onLike={() => recordFeedback(true)}
          onDislike={() => recordFeedback(false)}
          onReset={reset}
        />
      )}
    </div>
  );
}

function ScanResult({
  fragrance,
  onLike,
  onDislike,
  onReset,
}: {
  fragrance: Fragrance;
  onLike: () => void;
  onDislike: () => void;
  onReset: () => void;
}) {
  const [given, setGiven] = useState<"liked" | "disliked" | null>(null);

  return (
    <section className="flex flex-col gap-6">
      <div className="relative aspect-[4/5] bg-surface-container-low overflow-hidden">
        {fragrance.imageUrl && (
          <img
            src={fragrance.imageUrl}
            alt={fragrance.name}
            className="w-full h-full object-cover grayscale contrast-110"
          />
        )}
        <div className="absolute top-3 left-3">
          <span className="text-[10px] uppercase tracking-widest font-mono bg-background/90 px-2 py-1 border border-outline-variant">
            REF: {fragrance.reference}
          </span>
        </div>
        <div className="absolute top-3 right-3">
          <span className="text-[10px] uppercase tracking-widest font-mono bg-primary text-on-primary px-2 py-1">
            MATCH 96%
          </span>
        </div>
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-[0.2em] text-outline">
          {fragrance.brand}
        </p>
        <h2 className="text-3xl font-bold tracking-tight">{fragrance.name}</h2>
        {fragrance.description && (
          <p className="text-sm text-on-surface-variant mt-3 max-w-md leading-relaxed">
            {fragrance.description}
          </p>
        )}
      </div>

      {!given ? (
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
      )}

      <div className="flex flex-col gap-2">
        <Link
          href={`/fragrance/${fragrance.key}`}
          className="w-full py-4 border border-outline-variant rounded-full text-xs uppercase tracking-[0.2em] font-bold hover:border-primary text-center active:scale-95 transition-all"
        >
          Voir le détail
        </Link>
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
