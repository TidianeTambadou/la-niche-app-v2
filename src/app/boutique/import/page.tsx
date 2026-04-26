"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { PerfumeArtwork } from "@/components/PerfumeArtwork";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useData, useMyShop } from "@/lib/data";
import { agentSearch, agentIdentify } from "@/lib/agent-client";
import type { SearchCandidate, IdentifyResult } from "@/lib/agent";

type Step =
  | { kind: "search" }
  | { kind: "confirm"; candidate: SearchCandidate }
  | { kind: "camera" }
  | { kind: "scanning" }
  | { kind: "scan-confirm"; result: IdentifyResult }
  | { kind: "submitting" }
  | {
      kind: "done";
      brand: string;
      name: string;
      family: string | null;
      notesCount: number;
      enriched: boolean;
    };

export default function BoutiqueImportPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { loading: dataLoading, refresh } = useData();
  const myShop = useMyShop();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [step, setStep] = useState<Step>({ kind: "search" });
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (authLoading || dataLoading) return;
    if (!user) router.replace("/login?redirect=/boutique/import");
    else if (!myShop) router.replace("/");
  }, [authLoading, dataLoading, user, myShop, router]);

  // Autocomplete : 1500ms debounce + min 4 chars (logique cost-aware identique à /search).
  useEffect(() => {
    if (step.kind !== "search") return;
    const q = query.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();
    if (q.length < 4) {
      setResults([]);
      setSearching(false);
      setError(null);
      return;
    }
    setSearching(true);
    setError(null);
    debounceRef.current = setTimeout(async () => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const r = await agentSearch(q, ctrl.signal);
        if (!ctrl.signal.aborted) {
          setResults(r);
          setSearching(false);
        }
      } catch (e) {
        if (!ctrl.signal.aborted) {
          setError(e instanceof Error ? e.message : "Recherche échouée");
          setSearching(false);
        }
      }
    }, 1500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, step.kind]);

  // Stream attaché au <video> dès que l'élément est monté (camera/scanning).
  useEffect(() => {
    if (step.kind !== "camera" && step.kind !== "scanning") return;
    if (!videoRef.current || !streamRef.current) return;
    if (videoRef.current.srcObject === streamRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    videoRef.current.play().catch(() => {});
  }, [step.kind]);

  // Coupe la caméra dès qu'on quitte le mode caméra. PAS de cleanup ici —
  // sinon, en passant de "search" → "camera", React tirerait le cleanup du
  // run précédent AVANT le nouveau body et flinguerait le stream que
  // startCamera() vient de créer (= écran noir).
  useEffect(() => {
    if (step.kind !== "camera" && step.kind !== "scanning") {
      stopCamera();
    }
  }, [step.kind]);

  // Cleanup de la caméra uniquement au démontage.
  useEffect(() => () => stopCamera(), []);

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  async function startCamera() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      setStep({ kind: "camera" });
    } catch {
      setError(
        "Caméra indisponible. Autorise l'accès dans les réglages du navigateur.",
      );
    }
  }

  async function captureAndIdentify() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setError("La caméra n'est pas prête. Réessaie.");
      return;
    }
    setStep({ kind: "scanning" });
    setError(null);

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
      setStep({ kind: "camera" });
      return;
    }
    ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    const base64 = dataUrl.split(",")[1] ?? "";
    if (!base64) {
      setError("Impossible d'encoder l'image.");
      setStep({ kind: "camera" });
      return;
    }

    try {
      const result = await agentIdentify(base64, "image/jpeg");
      stopCamera();
      if (!result) {
        researchAfterMissedScan(query.trim());
        return;
      }
      setStep({ kind: "scan-confirm", result });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan échoué");
      setStep({ kind: "camera" });
    }
  }

  // Après un scan rejeté ou non concluant : on remet le mode "search" et on
  // bascule la query — l'effet d'autocomplete relance agentSearch (Fragella
  // d'abord, Tavily/IA si Fragella down). Si Fragella répond "vide", le
  // panneau "pas de match" reprend la main avec le bouton scan + re-saisie.
  function researchAfterMissedScan(seedQuery: string) {
    setError(null);
    setQuery(seedQuery.trim());
    setStep({ kind: "search" });
  }

  async function submit(brand: string, perfume_name: string, image_url?: string | null) {
    setError(null);
    setStep({ kind: "submitting" });
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Session expirée");
      const res = await fetch("/api/boutique/stock", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          brand,
          perfume_name,
          price: price.trim() ? Number(price) : null,
          quantity: quantity.trim() ? Number(quantity) : 1,
          image_url: image_url ?? null,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as {
        item: {
          brand: string;
          perfume_name: string;
          family: string | null;
          notes_top: string[];
          notes_heart: string[];
          notes_base: string[];
        };
        enriched: boolean;
      };
      const total =
        json.item.notes_top.length +
        json.item.notes_heart.length +
        json.item.notes_base.length;
      setStep({
        kind: "done",
        brand: json.item.brand,
        name: json.item.perfume_name,
        family: json.item.family,
        notesCount: total,
        enriched: json.enriched,
      });
      setQuery("");
      setResults([]);
      setPrice("");
      setQuantity("1");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setStep({ kind: "search" });
    }
  }

  if (authLoading || dataLoading || !myShop) {
    return (
      <div className="px-6 pt-12 text-center">
        <p className="text-[10px] uppercase tracking-widest text-outline">
          Chargement…
        </p>
      </div>
    );
  }

  const hasQuery = query.trim().length >= 4;

  return (
    <div className="px-6 pt-4 pb-12">
      <header className="mb-6">
        <span className="text-[10px] uppercase tracking-[0.3em] text-outline mb-2 block">
          Console boutique · Import
        </span>
        <h1 className="text-3xl font-bold tracking-tighter leading-none">
          Ajouter un parfum
        </h1>
        <p className="text-sm text-on-surface-variant mt-3 max-w-md leading-relaxed">
          Tape la maison + le nom du parfum. On cherche dans Fragella et on
          autocomplète famille + pyramide. Tu confirmes avant l&apos;ajout —
          aucune note n&apos;est stockée sans ton OK.
        </p>
      </header>

      <canvas ref={canvasRef} className="hidden" />

      {step.kind === "search" && (
        <SearchStep
          query={query}
          setQuery={setQuery}
          searching={searching}
          results={results}
          hasQuery={hasQuery}
          onPick={(c) => setStep({ kind: "confirm", candidate: c })}
          onScan={startCamera}
        />
      )}

      {step.kind === "confirm" && (
        <ConfirmStep
          candidate={step.candidate}
          price={price}
          quantity={quantity}
          setPrice={setPrice}
          setQuantity={setQuantity}
          onConfirm={() =>
            submit(
              step.candidate.brand,
              step.candidate.name,
              step.candidate.image_url,
            )
          }
          onReject={() => setStep({ kind: "search" })}
          onScan={startCamera}
        />
      )}

      {(step.kind === "camera" || step.kind === "scanning") && (
        <CameraStep
          videoRef={videoRef}
          scanning={step.kind === "scanning"}
          onCapture={captureAndIdentify}
          onCancel={() => setStep({ kind: "search" })}
        />
      )}

      {step.kind === "scan-confirm" && (
        <ScanConfirmStep
          result={step.result}
          price={price}
          quantity={quantity}
          setPrice={setPrice}
          setQuantity={setQuantity}
          onConfirm={() =>
            submit(step.result.brand, step.result.name, step.result.image_url)
          }
          onReject={() =>
            researchAfterMissedScan(
              query.trim() || `${step.result.brand} ${step.result.name}`,
            )
          }
        />
      )}

      {step.kind === "submitting" && (
        <div className="text-center py-12">
          <Icon
            name="progress_activity"
            size={28}
            className="animate-spin text-primary mx-auto mb-3"
          />
          <p className="text-[10px] uppercase tracking-widest text-outline">
            Enrichissement Fragella…
          </p>
        </div>
      )}

      {step.kind === "done" && (
        <DoneStep last={step} onAddAnother={() => setStep({ kind: "search" })} />
      )}

      {error && (
        <div className="mt-6 border border-error/50 bg-error-container/20 px-4 py-3">
          <p className="text-xs text-error">{error}</p>
        </div>
      )}

      <div className="mt-10 pt-6 border-t border-outline-variant/40 flex justify-between items-center">
        <Link
          href="/boutique"
          className="text-[10px] uppercase tracking-widest font-bold border-b border-primary pb-0.5"
        >
          ← Retour au tableau de bord
        </Link>
      </div>
    </div>
  );
}

/* ─── Step 1 — recherche + autocomplete ─────────────────────────────────── */

function SearchStep({
  query,
  setQuery,
  searching,
  results,
  hasQuery,
  onPick,
  onScan,
}: {
  query: string;
  setQuery: (v: string) => void;
  searching: boolean;
  results: SearchCandidate[];
  hasQuery: boolean;
  onPick: (c: SearchCandidate) => void;
  onScan: () => void;
}) {
  const showNoMatch = hasQuery && !searching && results.length === 0;

  return (
    <section className="flex flex-col gap-5">
      <div>
        <label
          htmlFor="query"
          className="text-[10px] uppercase tracking-[0.2em] font-bold text-outline block mb-2"
        >
          Maison + nom du parfum
        </label>
        <div className="flex items-center gap-3 border-b-2 border-primary pb-3">
          <Icon name="search" size={18} className="text-outline" />
          <input
            id="query"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ex: Atelier Materi Santal Shaowo"
            className="flex-1 bg-transparent border-none outline-none text-base font-light placeholder:text-outline/60 py-1"
            autoComplete="off"
            autoFocus
          />
          {searching ? (
            <Icon
              name="progress_activity"
              size={16}
              className="text-outline animate-spin"
            />
          ) : query.length > 0 ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Effacer"
              className="text-outline hover:text-on-background"
            >
              <Icon name="close" size={16} />
            </button>
          ) : null}
        </div>
        <p className="text-[10px] text-outline mt-2 leading-relaxed">
          Min. 4 caractères. La recherche démarre 1,5 s après ta dernière
          frappe.
        </p>
      </div>

      {searching && results.length === 0 && (
        <ul className="space-y-2">
          {[0, 1, 2].map((i) => (
            <li
              key={i}
              className="h-20 bg-surface-container-low animate-pulse"
            />
          ))}
        </ul>
      )}

      {results.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-outline mb-3">
            {results.length} résultat{results.length > 1 ? "s" : ""} · clique
            pour confirmer
          </p>
          <ul className="flex flex-col">
            {results.map((c, i) => (
              <li
                key={`${c.brand}-${c.name}-${i}`}
                className="py-3 border-b border-outline-variant/30 last:border-0"
              >
                <button
                  type="button"
                  onClick={() => onPick(c)}
                  className="w-full flex items-start gap-3 text-left hover:bg-surface-container-low active:scale-[0.99] transition-all p-1 -m-1"
                >
                  <PerfumeArtwork
                    brand={c.brand}
                    name={c.name}
                    imageUrl={c.image_url}
                    variant="thumb"
                    className="w-14 h-18 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-outline">
                      {c.brand}
                      {c.family ? ` · ${c.family}` : ""}
                    </p>
                    <p className="text-base font-semibold tracking-tight">
                      {c.name}
                    </p>
                    {c.notes_brief && (
                      <p className="text-[11px] text-on-surface-variant mt-1 leading-relaxed">
                        {c.notes_brief}
                      </p>
                    )}
                  </div>
                  <Icon
                    name="chevron_right"
                    size={18}
                    className="text-outline self-center"
                  />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showNoMatch && (
        <div className="border border-outline-variant bg-surface-container-low p-5 flex flex-col gap-4">
          <div>
            <p className="text-sm font-semibold tracking-tight">
              Pas de match pour «&nbsp;{query.trim()}&nbsp;».
            </p>
            <p className="text-[11px] text-on-surface-variant mt-1.5 leading-relaxed">
              Scanne le flacon pour qu&apos;on identifie via l&apos;image, ou
              modifie ta recherche (ajoute la maison, change l&apos;orthographe).
            </p>
          </div>
          <button
            type="button"
            onClick={onScan}
            className="w-full py-3.5 bg-primary text-on-primary rounded-full text-[10px] uppercase tracking-[0.2em] font-bold flex items-center justify-center gap-2 active:scale-95 transition-all"
          >
            <Icon name="document_scanner" size={14} />
            Scanner le flacon
          </button>
        </div>
      )}

      {!hasQuery && (
        <button
          type="button"
          onClick={onScan}
          className="w-full py-3.5 border border-outline-variant rounded-full text-[10px] uppercase tracking-[0.2em] font-bold flex items-center justify-center gap-2 hover:border-primary transition-all"
        >
          <Icon name="document_scanner" size={14} />
          Plutôt scanner le flacon
        </button>
      )}
    </section>
  );
}

/* ─── Step 2 — confirmation d'un candidat (avec pyramide notes) ─────────── */

function ConfirmStep({
  candidate,
  price,
  quantity,
  setPrice,
  setQuantity,
  onConfirm,
  onReject,
  onScan,
}: {
  candidate: SearchCandidate;
  price: string;
  quantity: string;
  setPrice: (v: string) => void;
  setQuantity: (v: string) => void;
  onConfirm: () => void;
  onReject: () => void;
  onScan: () => void;
}) {
  const card = candidate.card;
  const top = card?.notes.top ?? [];
  const middle = card?.notes.middle ?? [];
  const base = card?.notes.base ?? [];
  const hasPyramid = top.length + middle.length + base.length > 0;

  return (
    <section className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <Icon name="task_alt" size={14} className="text-primary" />
        <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-primary">
          Vérifie avant d&apos;ajouter
        </p>
      </div>

      <div className="border border-outline-variant bg-surface-container-low p-5 flex gap-4">
        <PerfumeArtwork
          brand={candidate.brand}
          name={candidate.name}
          imageUrl={candidate.image_url}
          variant="thumb"
          className="w-20 h-26 flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-[0.2em] text-outline">
            {candidate.brand}
          </p>
          <p className="text-lg font-bold tracking-tight leading-tight">
            {candidate.name}
          </p>
          {candidate.family && (
            <span className="inline-block mt-2 text-[9px] uppercase tracking-widest border border-outline-variant px-2 py-0.5">
              {candidate.family}
            </span>
          )}
        </div>
      </div>

      {hasPyramid ? (
        <div className="border border-outline-variant p-5 flex flex-col gap-3">
          <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-outline">
            Pyramide olfactive (Fragella)
          </p>
          <PyramidRow label="Tête" notes={top.map((n) => n.name)} />
          <PyramidRow label="Cœur" notes={middle.map((n) => n.name)} />
          <PyramidRow label="Fond" notes={base.map((n) => n.name)} />
        </div>
      ) : candidate.notes_brief ? (
        <div className="border border-outline-variant p-5">
          <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-outline mb-2">
            Notes (résumé)
          </p>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            {candidate.notes_brief}
          </p>
          <p className="text-[10px] text-outline mt-3 leading-relaxed">
            Pas de pyramide détaillée — l&apos;ajout va re-tenter Fragella côté
            serveur. Si rien ne remonte, tu pourras relancer l&apos;IA depuis
            le tableau de bord.
          </p>
        </div>
      ) : (
        <div className="border border-outline-variant p-5">
          <p className="text-[10px] text-outline leading-relaxed">
            Pas de notes disponibles pour le moment. L&apos;ajout va tenter
            l&apos;enrichissement Fragella côté serveur.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Field
          id="price"
          label="Prix (€)"
          value={price}
          onChange={setPrice}
          placeholder="180"
          type="number"
        />
        <Field
          id="quantity"
          label="Quantité"
          value={quantity}
          onChange={setQuantity}
          placeholder="1"
          type="number"
        />
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onConfirm}
          className="w-full py-4 bg-primary text-on-primary rounded-full text-xs uppercase tracking-[0.2em] font-bold flex items-center justify-center gap-2 active:scale-95 transition-all"
        >
          <Icon name="check_circle" size={14} />
          Oui, c&apos;est bien ce parfum — ajouter
        </button>
        <button
          type="button"
          onClick={onReject}
          className="w-full py-3.5 border border-outline-variant rounded-full text-[10px] uppercase tracking-[0.2em] font-bold hover:border-error hover:text-error transition-all flex items-center justify-center gap-2"
        >
          <Icon name="close" size={14} />
          Non, ce n&apos;est pas ça
        </button>
        <button
          type="button"
          onClick={onScan}
          className="w-full py-3 text-[10px] uppercase tracking-widest font-bold text-outline hover:text-on-background transition-colors flex items-center justify-center gap-2"
        >
          <Icon name="document_scanner" size={12} />
          Plutôt scanner le flacon
        </button>
      </div>
    </section>
  );
}

function PyramidRow({ label, notes }: { label: string; notes: string[] }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-widest text-outline mb-1">
        {label}
      </p>
      {notes.length > 0 ? (
        <p className="text-sm leading-snug">{notes.join(", ")}</p>
      ) : (
        <p className="text-[11px] text-outline italic">non renseigné</p>
      )}
    </div>
  );
}

/* ─── Step 3 — caméra (scan inline) ─────────────────────────────────────── */

function CameraStep({
  videoRef,
  scanning,
  onCapture,
  onCancel,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  scanning: boolean;
  onCapture: () => void;
  onCancel: () => void;
}) {
  return (
    <section className="flex flex-col gap-5">
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
        {scanning && (
          <div className="absolute inset-0 bg-primary/40 flex items-center justify-center">
            <span className="text-[10px] uppercase tracking-widest font-mono text-on-primary">
              Identification…
            </span>
          </div>
        )}
        <div className="absolute top-3 left-3">
          <span className="text-[10px] uppercase tracking-widest font-mono bg-background/80 px-2 py-1 border border-outline-variant">
            {scanning ? "ANALYSE…" : "CADRE LE FLACON"}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={onCapture}
        disabled={scanning}
        className="w-full py-4 bg-primary text-on-primary rounded-full text-xs uppercase tracking-[0.2em] font-bold flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50"
      >
        <Icon name="center_focus_strong" size={14} />
        {scanning ? "Analyse en cours" : "Capturer"}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={scanning}
        className="w-full py-3 border border-outline-variant rounded-full text-[10px] uppercase tracking-widest font-bold hover:border-primary transition-all disabled:opacity-40"
      >
        Annuler
      </button>
    </section>
  );
}

/* ─── Step 4 — confirmation après scan ──────────────────────────────────── */

function ScanConfirmStep({
  result,
  price,
  quantity,
  setPrice,
  setQuantity,
  onConfirm,
  onReject,
}: {
  result: IdentifyResult;
  price: string;
  quantity: string;
  setPrice: (v: string) => void;
  setQuantity: (v: string) => void;
  onConfirm: () => void;
  onReject: () => void;
}) {
  const confidencePct = Math.round((result.confidence ?? 0) * 100);
  const lowConfidence = confidencePct < 60;

  return (
    <section className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <Icon name="document_scanner" size={14} className="text-primary" />
        <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-primary">
          Identification — confirme avant d&apos;ajouter
        </p>
      </div>

      <div className="relative aspect-[4/5] bg-surface-container-low overflow-hidden">
        <PerfumeArtwork
          brand={result.brand}
          name={result.name}
          imageUrl={result.image_url ?? undefined}
          variant="card"
          showSoonCaption={false}
          className="absolute inset-0 w-full h-full border-0"
        />
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
          {result.brand}
        </p>
        <h2 className="text-2xl font-bold tracking-tight">{result.name}</h2>
        {result.notes_brief && (
          <p className="text-sm text-on-surface-variant mt-2 leading-relaxed">
            {result.notes_brief}
          </p>
        )}
        {lowConfidence && (
          <p className="text-[11px] text-error mt-3 border border-error/40 px-3 py-2">
            Confiance faible — vérifie bien le nom avant d&apos;ajouter au stock.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field
          id="price-scan"
          label="Prix (€)"
          value={price}
          onChange={setPrice}
          placeholder="180"
          type="number"
        />
        <Field
          id="quantity-scan"
          label="Quantité"
          value={quantity}
          onChange={setQuantity}
          placeholder="1"
          type="number"
        />
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onConfirm}
          className="w-full py-4 bg-primary text-on-primary rounded-full text-xs uppercase tracking-[0.2em] font-bold flex items-center justify-center gap-2 active:scale-95 transition-all"
        >
          <Icon name="check_circle" size={14} />
          Oui, ajouter au stock
        </button>
        <button
          type="button"
          onClick={onReject}
          className="w-full py-3.5 border border-outline-variant rounded-full text-[10px] uppercase tracking-[0.2em] font-bold hover:border-error hover:text-error transition-all flex items-center justify-center gap-2"
        >
          <Icon name="restart_alt" size={14} />
          Non — relancer la recherche
        </button>
      </div>
    </section>
  );
}

/* ─── Step 5 — succès ────────────────────────────────────────────────────── */

function DoneStep({
  last,
  onAddAnother,
}: {
  last: {
    brand: string;
    name: string;
    family: string | null;
    notesCount: number;
    enriched: boolean;
  };
  onAddAnother: () => void;
}) {
  return (
    <section className="flex flex-col gap-5">
      <div className="border border-primary/40 bg-primary/[0.04] p-5">
        <div className="flex items-center gap-2 mb-3">
          <Icon name="check_circle" size={16} className="text-primary" />
          <p className="text-[10px] uppercase tracking-widest font-bold text-primary">
            Ajouté au stock
          </p>
        </div>
        <p className="text-sm font-semibold">{last.name}</p>
        <p className="text-[10px] uppercase tracking-widest text-outline mt-0.5">
          {last.brand}
        </p>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {last.family && (
            <span className="text-[9px] uppercase tracking-widest border border-outline-variant px-2 py-0.5">
              {last.family}
            </span>
          )}
          <span
            className={
              last.enriched
                ? "text-[9px] uppercase tracking-widest text-primary border border-primary/40 px-2 py-0.5"
                : "text-[9px] uppercase tracking-widest text-outline border border-outline-variant px-2 py-0.5"
            }
          >
            {last.enriched
              ? `${last.notesCount} notes IA`
              : "Pas de match Fragella — relance plus tard"}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={onAddAnother}
        className="w-full py-4 bg-primary text-on-primary rounded-full text-xs uppercase tracking-[0.2em] font-bold flex items-center justify-center gap-2 active:scale-95 transition-all"
      >
        <Icon name="add" size={14} />
        Ajouter un autre parfum
      </button>
    </section>
  );
}

/* ─── Petits éléments partagés ──────────────────────────────────────────── */

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "number";
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="text-[10px] uppercase tracking-[0.2em] font-bold text-outline block mb-2"
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={type === "number" ? "decimal" : "text"}
        className="w-full bg-transparent border-b border-outline-variant py-2 text-base focus:outline-none focus:border-primary placeholder:text-outline/50 transition-colors"
      />
    </div>
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
