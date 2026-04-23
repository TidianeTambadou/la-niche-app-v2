"use client";

import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { Icon } from "@/components/Icon";
import { agentAsk, type AskHistoryTurn } from "@/lib/agent-client";

/**
 * Floating expert concierge — fixed bottom-left on every page (mounted in
 * AppShell). Click → smooth scale/slide-in chat sheet that talks to the
 * AGENT_SYSTEM_PROMPT (niche perfumery expert, Fragrantica/Basenotes/etc.
 * sources only) via /api/agent in "ask" mode.
 *
 * Multi-turn: keeps last 10 turns and forwards them as `history` so follow-
 * up questions ("et son sillage ?") have context.
 */

type Msg = { id: number; role: "user" | "assistant" | "error"; content: string };

const SUGGESTIONS = [
  "Recommande-moi un parfum boisé pour l'hiver",
  "Tenue et sillage du Tom Ford Oud Wood ?",
  "Compare Aventus et Bleu de Chanel",
];

export function ConciergeWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const idCounter = useRef(0);

  // Auto-scroll on new messages / typing indicator.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  // Focus the input when sheet opens.
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 250);
      return () => clearTimeout(t);
    }
  }, [open]);

  // ESC to close.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

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
        .slice(0, -1) // last user turn is the new question
        .map((m) => ({ role: m.role, content: m.content }));
      const answer = await agentAsk(q, history);
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
      {/* Floating trigger — bottom-left, above the tab bar. */}
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

      {/* Chat sheet — anchored bottom-left, scales/fades from the trigger. */}
      <div
        className={clsx(
          "fixed left-2 right-2 sm:right-auto sm:left-4 sm:w-[380px] z-40",
          "bg-background border border-outline shadow-2xl flex flex-col",
          "origin-bottom-left transition-all duration-300 ease-out",
          open
            ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
            : "opacity-0 scale-90 translate-y-6 pointer-events-none",
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
        <header className="px-4 py-3 border-b border-outline-variant flex items-center gap-3">
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
            messages.map((m) => <Bubble key={m.id} msg={m} />)
          )}
          {sending && <TypingIndicator />}
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="border-t border-outline-variant p-3 flex items-end gap-2"
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
 * Avatar — uses the La Niche brand mark from /public if present, falls back
 * to a clean monogram tile in the ATELIER aesthetic.
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
 * Empty state — short pitch + tap-to-send suggestion chips.
 * --------------------------------------------------------------------- */

function EmptyState({ onPick }: { onPick: (s: string) => void }) {
  return (
    <div className="flex flex-col gap-4 py-2">
      <div>
        <p className="text-xs text-on-surface-variant leading-relaxed">
          Pose une question sur un parfum, des notes, une comparaison, ou
          demande une recommandation. Sources :{" "}
          <span className="font-mono text-[10px]">
            fragrantica · basenotes · parfumo · nstperfume · fragrancex
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
 * Bubble — minimal monochrome chat bubble.
 * --------------------------------------------------------------------- */

function Bubble({ msg }: { msg: Msg }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-on-background text-background px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap">
          {msg.content}
        </div>
      </div>
    );
  }
  if (msg.role === "error") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] border border-error/40 text-error px-3 py-2 text-xs leading-relaxed">
          ⚠️ {msg.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] border border-outline-variant px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap text-on-background">
        {msg.content}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Typing indicator while waiting for /api/agent ask response.
 *
 * The agent calls web_search so the wait is long (5-15s). A plain dot loop
 * feels broken at that duration — instead we show:
 *   - 3 shimmer skeleton bars (clinical, matches ATELIER aesthetic)
 *   - a pulsing source-status dot + caption that cycles through the
 *     agent's actual stages (consulte fragrantica → compare → synthèse)
 *
 * The cycling caption gives the user a sense of progress AND tells them
 * why it's slow (the agent is reading external sources).
 * --------------------------------------------------------------------- */

const LOADING_STEPS = [
  "Consulte fragrantica.com",
  "Vérifie sur basenotes",
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
    <div className="flex justify-start">
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
