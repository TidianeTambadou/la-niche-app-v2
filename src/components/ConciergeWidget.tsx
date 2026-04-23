"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import { Icon } from "@/components/Icon";
import { agentAsk, type AskHistoryTurn } from "@/lib/agent-client";

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
      <div className="bubble-in flex justify-start">
        <div className="max-w-[85%] border border-error/40 text-error px-3 py-2 text-xs leading-relaxed">
          ⚠ {msg.content}
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
  return <div className="space-y-1">{parseMarkdown(text)}</div>;
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
