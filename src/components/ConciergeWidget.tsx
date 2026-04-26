"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import { Icon } from "@/components/Icon";
import { ErrorBubble } from "@/components/ErrorBubble";
import { PerfumeCardModal } from "@/components/PerfumeCardModal";
import { agentAsk, type AskHistoryTurn } from "@/lib/agent-client";
import { useAuth } from "@/lib/auth";
import { onOpenConcierge } from "@/lib/concierge-bus";
import type { PerfumeCardData, PerfumeAccord } from "@/lib/agent";
import {
  readProfileFromUser,
  FAMILY_VULGAR,
  INTENSITY_VULGAR,
  MOMENT_VULGAR,
  OCCASION_VULGAR,
  BUDGET_VULGAR,
} from "@/lib/profile";
import { buildQuizContext } from "@/lib/quiz";

type Msg = { id: number; role: "user" | "assistant" | "error"; content: string };

const SUGGESTIONS = [
  "Recommande-moi un parfum boisé pour l'hiver",
  "Tenue et sillage du Tom Ford Oud Wood ?",
  "Compare Aventus et Bleu de Chanel",
];

function buildProfileContext(user: ReturnType<typeof useAuth>["user"]): string | undefined {
  const profile = readProfileFromUser(user);
  if (!profile) return undefined;
  // Prefer the richer quiz answers when the new onboarding has been
  // completed; fall back to the legacy derived fields otherwise.
  if (profile.quiz_answers) {
    return [
      buildQuizContext(profile.quiz_answers, "self"),
      "",
      "Quand tu fais des recommandations, priorise les parfums qui correspondent à ce profil. Explique pourquoi chaque suggestion correspond.",
    ].join("\n");
  }
  const families = profile.preferred_families
    .map((f) => FAMILY_VULGAR[f]?.title ?? f)
    .join(", ");
  const intensity = INTENSITY_VULGAR[profile.intensity_preference]?.title ?? profile.intensity_preference;
  const budget = BUDGET_VULGAR[profile.budget]?.title ?? profile.budget;
  const moments = profile.moments.map((m) => MOMENT_VULGAR[m]?.title ?? m).join(", ");
  const occasions = profile.occasions.map((o) => OCCASION_VULGAR[o]?.title ?? o).join(", ");
  return [
    "PROFIL OLFACTIF DE L'UTILISATEUR (utilise ces informations pour personnaliser tes réponses) :",
    `- Familles olfactives préférées : ${families}`,
    `- Sillage recherché : ${intensity}`,
    `- Budget parfum : ${budget}`,
    moments ? `- Moments d'utilisation : ${moments}` : null,
    occasions ? `- Occasions : ${occasions}` : null,
    "",
    "Quand tu fais des recommandations, priorise les parfums qui correspondent à ces familles et ce budget. Explique pourquoi chaque suggestion correspond à son profil.",
  ].filter(Boolean).join("\n");
}

export function ConciergeWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const idCounter = useRef(0);

  function scrollToBottom() {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }

  useEffect(() => {
    scrollToBottom();
  }, [messages, sending]);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 250);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Listen for global "open concierge" requests fired from anywhere in the
  // app — typically the search page when Fragella has no result and offers
  // a "demande à la conciergerie" CTA pre-filled with the user's query.
  useEffect(() => {
    return onOpenConcierge((detail) => {
      setOpen(true);
      if (detail.message) {
        setInput(detail.message);
        if (detail.autosend) {
          // Defer until after open animation so the message lands in chat.
          window.setTimeout(() => void send(detail.message), 320);
        }
      }
    });
    // `send` is stable across renders for this purpose — including it would
    // re-subscribe on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function nextId(): number {
    idCounter.current += 1;
    return idCounter.current;
  }

  async function send(text?: string) {
    const q = (text ?? input).trim();
    if (!q || sending) return;

    const userMsg: Msg = { id: nextId(), role: "user", content: q };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setSending(true);

    try {
      const history: AskHistoryTurn[] = next
        .filter((m): m is Msg & { role: "user" | "assistant" } =>
          m.role === "user" || m.role === "assistant",
        )
        .slice(0, -1)
        .map((m) => ({ role: m.role, content: m.content }));
      const answer = await agentAsk(q, history, undefined, buildProfileContext(user));
      setMessages((curr) => [
        ...curr,
        { id: nextId(), role: "assistant", content: answer },
      ]);
    } catch (e) {
      setMessages((curr) => [
        ...curr,
        {
          id: nextId(),
          role: "error",
          content: e instanceof Error ? e.message : "Erreur inconnue",
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  function reset() {
    setMessages([]);
    setInput("");
  }

  return (
    <>
      {/* Floating trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          "fixed left-4 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300",
          "active:scale-90",
          open
            ? "bottom-4 bg-on-background text-background rotate-90"
            : "bottom-24 bg-background text-on-background border border-outline hover:scale-105",
        )}
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        aria-label={open ? "Fermer l'expert" : "Parler à l'expert"}
        aria-expanded={open}
      >
        {open ? (
          <Icon name="close" size={22} />
        ) : (
          <ConciergeAvatar size={56} />
        )}
      </button>

      {/* Chat sheet — slide-up (no scale-pop) */}
      <div
        className={clsx(
          "fixed left-2 right-2 sm:right-auto sm:left-4 sm:w-[380px] z-40",
          "bg-background border border-outline shadow-2xl flex flex-col",
          "transition-all duration-300 ease-out",
          open
            ? "opacity-100 translate-y-0 pointer-events-auto"
            : "opacity-0 translate-y-6 pointer-events-none",
        )}
        style={{
          bottom: "calc(6rem + env(safe-area-inset-bottom))",
          height: "min(70vh, 640px)",
        }}
        role="dialog"
        aria-label="Concierge expert parfumerie"
        aria-hidden={!open}
      >
        {/* Header */}
        <header className="px-4 py-3 border-b border-outline-variant flex items-center gap-3 flex-shrink-0">
          <ConciergeAvatar size={36} />
          <div className="flex-1 min-w-0">
            <p className="text-[9px] uppercase tracking-[0.25em] text-outline">
              Concierge
            </p>
            <p className="text-sm font-bold tracking-tight leading-tight">
              L&apos;expert parfumerie
            </p>
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={reset}
              className="text-[10px] uppercase tracking-widest font-bold text-outline hover:text-on-background transition-colors px-2 py-1"
              title="Nouvelle conversation"
            >
              <Icon name="refresh" size={16} />
            </button>
          )}
        </header>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 space-y-3"
        >
          {messages.length === 0 ? (
            <EmptyState onPick={(s) => send(s)} />
          ) : (
            messages.map((m, i) => (
              <Bubble
                key={m.id}
                msg={m}
                isLatest={i === messages.length - 1}
                onTick={scrollToBottom}
              />
            ))
          )}
          {sending && <TypingIndicator />}
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="border-t border-outline-variant p-3 flex items-end gap-2 flex-shrink-0"
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Demande à l'expert…"
            disabled={sending}
            rows={1}
            className="flex-1 bg-surface-container-low border border-outline-variant px-3 py-2 text-sm focus:outline-none focus:border-primary disabled:opacity-50 resize-none max-h-32"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="w-10 h-10 bg-primary text-on-primary rounded-full flex items-center justify-center disabled:opacity-30 active:scale-95 transition-transform flex-shrink-0"
            aria-label="Envoyer"
          >
            <Icon name="arrow_upward" size={18} />
          </button>
        </form>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------
 * Avatar
 * --------------------------------------------------------------------- */

function ConciergeAvatar({ size }: { size: number }) {
  const [failed, setFailed] = useState(false);
  const px = `${size}px`;
  if (failed) {
    return (
      <div
        style={{ width: px, height: px, minWidth: px, minHeight: px }}
        className="bg-on-background text-background rounded-full flex items-center justify-center font-bold font-mono"
      >
        <span style={{ fontSize: Math.round(size * 0.32) }}>LN</span>
      </div>
    );
  }
  return (
    <div
      style={{ width: px, height: px, minWidth: px, minHeight: px }}
      className="rounded-full overflow-hidden bg-background flex items-center justify-center"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-laniche.png"
        alt="La Niche"
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
        onError={() => setFailed(true)}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Empty state
 * --------------------------------------------------------------------- */

function EmptyState({ onPick }: { onPick: (s: string) => void }) {
  return (
    <div className="flex flex-col gap-4 py-2">
      <div>
        <p className="text-xs text-on-surface-variant leading-relaxed">
          Pose une question sur un parfum, des notes, une comparaison, ou
          demande une recommandation. Sources :{" "}
          <span className="font-mono text-[10px]">
            base de connaissances La Niche
          </span>
          .
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-[9px] uppercase tracking-widest text-outline font-bold">
          Suggestions
        </p>
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="text-left text-xs px-3 py-2 border border-outline-variant hover:border-primary hover:bg-primary/5 transition-all"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Bubble — monochrome chat bubble with slide-in animation.
 * Latest assistant message gets word-by-word typewriter animation.
 * --------------------------------------------------------------------- */

function Bubble({
  msg,
  isLatest,
  onTick,
}: {
  msg: Msg;
  isLatest: boolean;
  onTick: () => void;
}) {
  if (msg.role === "user") {
    return (
      <div className="bubble-in flex justify-end">
        <div className="max-w-[85%] bg-on-background text-background px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap">
          {msg.content}
        </div>
      </div>
    );
  }
  if (msg.role === "error") {
    return (
      <div className="bubble-in flex justify-start w-full">
        <div className="max-w-[90%]">
          <ErrorBubble
            detail={msg.content}
            context="Concierge La Niche"
            variant="inline"
          />
        </div>
      </div>
    );
  }
  return (
    <div className="bubble-in flex justify-start">
      <div className="max-w-[90%] border border-outline-variant px-3 py-2.5 text-sm leading-relaxed text-on-background">
        {isLatest ? (
          <TypewriterText content={msg.content} onTick={onTick} />
        ) : (
          <MarkdownContent text={msg.content} />
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * TypewriterText — reveals words progressively (simulates AI streaming).
 * Targets ≤ 3 seconds total animation, min 1 word/tick at 30ms.
 * When no longer latest (new message arrived), snaps to full text.
 * --------------------------------------------------------------------- */

function TypewriterText({
  content,
  onTick,
}: {
  content: string;
  onTick: () => void;
}) {
  // Split preserving whitespace so rejoining gives the original text.
  const tokens = useMemo(() => content.split(/(\s+)/), [content]);
  const [count, setCount] = useState(0);

  useEffect(() => {
    setCount(0);
    const total = tokens.length;
    // Reveal enough tokens per 30ms tick to finish in max 3 seconds.
    const chunkSize = Math.max(1, Math.ceil(total / (3000 / 30)));
    const id = setInterval(() => {
      setCount((c) => {
        const next = Math.min(c + chunkSize, total);
        if (next >= total) clearInterval(id);
        onTick();
        return next;
      });
    }, 30);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  return <MarkdownContent text={tokens.slice(0, count).join("")} />;
}

/* -------------------------------------------------------------------------
 * MarkdownContent — renders the subset of markdown Gemini produces:
 *   **bold**  *italic*  bullet lists  **Section:**  blank-line paragraphs
 * --------------------------------------------------------------------- */

function MarkdownContent({ text }: { text: string }) {
  // Pre-segment the text: anywhere the LLM emitted a ```carte-laniche
  // block, render an inline ConciergeCardPreview instead of letting the
  // markdown parser dump the raw lines.
  const segments = useMemo(() => extractCarteLanicheBlocks(text), [text]);
  return (
    <div className="space-y-1">
      {segments.map((seg, i) =>
        seg.type === "card" ? (
          <ConciergeCardPreview key={i} card={seg.data} />
        ) : (
          <div key={i} className="space-y-1">
            {parseMarkdown(seg.content)}
          </div>
        ),
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * ```carte-laniche``` block parser — picks up the structured card the
 * concierge can emit when asked to "fais-moi la carte de X".
 *
 * Format (lines, free order, all optional except Brand + Name):
 *   Brand: <maison>
 *   Name: <nom>
 *   Family: <famille>
 *   Top:    <a, b, c>
 *   Heart:  <a, b, c>
 *   Base:   <a, b, c>
 *   Accords: <accord1>:90, <accord2>:75
 *   Longevity: <Long Lasting>
 *   Sillage:   <Strong>
 *   Seasons:   <winter,fall>
 *   Daytime:   <night>
 *   Description: <free text — supports a single line>
 * --------------------------------------------------------------------- */

type Segment =
  | { type: "text"; content: string }
  | { type: "card"; data: PerfumeCardData };

function extractCarteLanicheBlocks(text: string): Segment[] {
  const segments: Segment[] = [];
  const regex = /```carte-laniche\s*\n([\s\S]*?)\n```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: "text",
        content: text.slice(lastIndex, match.index),
      });
    }
    const data = parseCarteLanicheBlock(match[1]);
    if (data) segments.push({ type: "card", data });
    else
      segments.push({
        type: "text",
        content: `\n[carte mal formée — bloc ignoré]\n`,
      });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    segments.push({ type: "text", content: text.slice(lastIndex) });
  }
  return segments.length === 0
    ? [{ type: "text", content: text }]
    : segments;
}

function parseCarteLanicheBlock(block: string): PerfumeCardData | null {
  const fields: Record<string, string> = {};
  for (const raw of block.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z][A-Za-z _-]*?)\s*:\s*(.+)$/);
    if (!m) continue;
    fields[m[1].toLowerCase().replace(/\s|_|-/g, "")] = m[2].trim();
  }
  const brand = fields.brand;
  const name = fields.name;
  if (!brand || !name) return null;

  const splitList = (s: string | undefined): string[] =>
    (s ?? "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);

  const accords: PerfumeAccord[] = splitList(fields.accords).map((s) => {
    const [n, w] = s.split(":").map((x) => x.trim());
    const num = w ? Number(w) : NaN;
    return isFinite(num) && num > 0
      ? { name: n, weight: Math.max(0, Math.min(100, num)) }
      : { name: s };
  });

  const seasons = splitList(fields.seasons)
    .map((s) => s.toLowerCase())
    .map((s) => (s === "fall" ? "autumn" : s))
    .filter((s) => ["winter", "spring", "summer", "autumn"].includes(s));

  const day_time = splitList(fields.daytime)
    .map((s) => s.toLowerCase())
    .filter((s) => ["day", "night"].includes(s));

  return {
    name,
    brand,
    image_url: null,
    description: fields.description ?? null,
    gender: fields.gender ?? null,
    family: fields.family ?? null,
    notes: {
      top: splitList(fields.top).map((n) => ({ name: n })),
      middle: splitList(fields.heart ?? fields.middle).map((n) => ({ name: n })),
      base: splitList(fields.base).map((n) => ({ name: n })),
    },
    accords,
    longevity: fields.longevity ?? null,
    sillage: fields.sillage ?? null,
    seasons,
    day_time,
    rating: null,
    reviews_count: null,
    source_url: null,
  };
}

/* -------------------------------------------------------------------------
 * Inline preview rendered in the chat when the concierge produced a card.
 * Compact thumbnail + brand/name + family + "Voir" CTA opening the full
 * PerfumeCardModal. Tries to enrich with Fragella's image via the modal's
 * own lazy lookup (the modal will hit /api/agent card mode if needed).
 * --------------------------------------------------------------------- */

function ConciergeCardPreview({ card }: { card: PerfumeCardData }) {
  const [open, setOpen] = useState(false);
  const allAccords = card.accords.slice(0, 3).map((a) => a.name);
  const peekNotes = [
    ...card.notes.top.slice(0, 2),
    ...card.notes.middle.slice(0, 2),
    ...card.notes.base.slice(0, 1),
  ]
    .slice(0, 4)
    .map((n) => n.name);

  return (
    <>
      <div className="my-2 border border-outline bg-surface-container-low relative overflow-hidden">
        {/* Faint logo watermark behind the content */}
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          aria-hidden
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-laniche.png"
            alt=""
            className="w-3/4 h-3/4 object-contain opacity-[0.06]"
          />
        </div>

        <div className="relative p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] uppercase tracking-[0.3em] text-outline font-mono">
              Carte signée La Niche
            </span>
            {card.family && (
              <span className="text-[8px] uppercase tracking-widest font-bold bg-on-background text-background px-1.5 py-0.5">
                {card.family}
              </span>
            )}
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-outline">
              {card.brand}
            </p>
            <p className="text-base font-serif italic font-light leading-tight">
              {card.name}
            </p>
          </div>

          {allAccords.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {allAccords.map((a) => (
                <span
                  key={a}
                  className="text-[8px] uppercase tracking-widest font-bold border border-outline-variant px-1.5 py-0.5 bg-background"
                >
                  {a}
                </span>
              ))}
            </div>
          )}

          {peekNotes.length > 0 && (
            <p className="text-[10px] text-on-surface-variant leading-snug line-clamp-2">
              {peekNotes.join(" · ")}
            </p>
          )}

          <button
            type="button"
            onClick={() => setOpen(true)}
            className="self-start mt-1 text-[10px] uppercase tracking-widest font-bold text-on-background hover:text-primary border-b border-primary pb-px flex items-center gap-1"
          >
            <Icon name="style" size={11} />
            Voir la carte complète
          </button>
        </div>
      </div>

      <PerfumeCardModal
        open={open}
        onClose={() => setOpen(false)}
        card={card}
      />
    </>
  );
}

function parseMarkdown(text: string): ReactNode[] {
  const lines = text.split("\n");
  const result: ReactNode[] = [];
  let listItems: ReactNode[] = [];
  let key = 0;

  const nextKey = () => (key++).toString();

  function flushList() {
    if (listItems.length === 0) return;
    result.push(
      <ul key={nextKey()} className="space-y-0.5 pl-1">
        {listItems.map((item, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-outline mt-0.5 flex-shrink-0">·</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>,
    );
    listItems = [];
  }

  lines.forEach((line) => {
    // Bullet: "* text" or "- text" (with optional indent)
    if (/^\s*[*-]\s+/.test(line)) {
      listItems.push(renderInline(line.replace(/^\s*[*-]\s+/, "")));
      return;
    }
    flushList();

    if (line.trim() === "") {
      // Blank line — already handled by space-y-1 spacing
      return;
    }

    // Section header: line that is entirely **bold** (with optional colon)
    const headerMatch = line.trim().match(/^\*\*(.+?)\*\*\s*:?\s*$/);
    if (headerMatch) {
      result.push(
        <p key={nextKey()} className="font-bold mt-2 first:mt-0">
          {headerMatch[1]}
        </p>,
      );
      return;
    }

    result.push(<p key={nextKey()}>{renderInline(line)}</p>);
  });

  flushList();
  return result;
}

function renderInline(text: string): ReactNode {
  // Split on **bold** first, then *italic* within the remaining parts.
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
          return <em key={i}>{part.slice(1, -1)}</em>;
        }
        return part || null;
      })}
    </>
  );
}

/* -------------------------------------------------------------------------
 * Typing indicator — shimmer skeleton + cycling source caption.
 * --------------------------------------------------------------------- */

const LOADING_STEPS = [
  "L'équipe La Niche cherche…",
  "On feuillette nos archives",
  "Croise les avis utilisateurs",
  "Compare les notes olfactives",
  "Synthèse en cours",
] as const;

function TypingIndicator() {
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setStepIdx((i) => (i + 1) % LOADING_STEPS.length);
    }, 2200);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="bubble-in flex justify-start">
      <div className="w-[88%] max-w-[300px] flex flex-col gap-2">
        <div
          className="border border-outline-variant px-3 py-3 space-y-2"
          aria-live="polite"
          aria-label="L'expert prépare sa réponse"
        >
          <div className="h-2 shimmer-bar w-full" />
          <div className="h-2 shimmer-bar w-[85%]" />
          <div className="h-2 shimmer-bar w-[60%]" />
        </div>
        <div className="flex items-center gap-2 px-1">
          <span className="ring-pulse relative inline-flex w-1.5 h-1.5 rounded-full bg-on-background" />
          <span
            key={stepIdx}
            className="caption-rise text-[10px] uppercase tracking-[0.18em] text-outline font-mono leading-none"
          >
            {LOADING_STEPS[stepIdx]}
          </span>
        </div>
      </div>
    </div>
  );
}
