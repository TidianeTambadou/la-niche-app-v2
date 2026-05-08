"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Icon } from "@/components/Icon";
import { QuestionsConcierge } from "@/components/QuestionsConcierge";
import { useRequireAuth } from "@/lib/auth";
import { useShopRole } from "@/lib/role";
import { useGuardOutOfService } from "@/lib/service-mode";
import { authedFetch } from "@/lib/api-client";
import type { QuestionKind, ShopQuestion } from "@/lib/types";
import { DataLabel } from "@/components/brutalist/DataLabel";
import { BrutalistButton } from "@/components/brutalist/BrutalistButton";

const KIND_LABELS: Record<QuestionKind, string> = {
  text: "Texte libre",
  single: "Choix unique",
  multi: "Choix multiple",
  scale: "Échelle 1-5",
  email: "Email",
  phone: "Téléphone",
};

export default function QuestionsSettingsPage() {
  useRequireAuth();
  useGuardOutOfService("/pour-un-client", { bypassable: true });
  const router = useRouter();
  const { isBoutique, loading: roleLoading } = useShopRole();
  const [items, setItems] = useState<ShopQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ShopQuestion | "new" | null>(null);

  useEffect(() => {
    if (!roleLoading && !isBoutique) router.replace("/");
  }, [isBoutique, roleLoading, router]);

  useEffect(() => {
    if (!isBoutique) return;
    refresh();
  }, [isBoutique]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const json = await authedFetch<{ questions: ShopQuestion[] }>(
        "/api/shops/me/questions",
      );
      setItems(json.questions);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  async function persistOrder(next: ShopQuestion[]) {
    setItems(next);
    try {
      await authedFetch("/api/shops/me/questions", {
        method: "PUT",
        body: JSON.stringify({ ids: next.map((q) => q.id) }),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      // Reload the truth on failure so the UI doesn't drift.
      refresh();
    }
  }

  async function remove(id: string) {
    if (!confirm("Supprimer cette question ?")) return;
    try {
      await authedFetch(`/api/shops/me/questions/${id}`, { method: "DELETE" });
      setItems((arr) => arr.filter((q) => q.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    persistOrder(arrayMove(items, oldIndex, newIndex));
  }

  return (
    <div className="px-6 py-6 flex flex-col gap-6">
      <header className="relative pl-6">
        <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-on-background" />
        <DataLabel>QUESTIONNAIRE · {items.length} ITEMS</DataLabel>
        <h1 className="font-sans font-black text-3xl tracking-tighter uppercase leading-none mt-2">
          QUESTION-
          <br />
          <span className="ml-4">NAIRE</span>
        </h1>
        <p className="font-cormorant italic text-base opacity-70 mt-3">
          « Glisse les questions pour les réorganiser — utilisé dans Pour un
          client et côté utilisateur. »
        </p>
      </header>

      {error && (
        <div className="border-2 border-on-background bg-on-background text-background px-4 py-3">
          <p className="font-mono text-xs uppercase tracking-wider">{error}</p>
        </div>
      )}

      {loading ? (
        <DataLabel>LOADING…</DataLabel>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <ul className="flex flex-col gap-2">
              {items.map((q) => (
                <SortableRow key={q.id} q={q} onEdit={() => setEditing(q)} onDelete={() => remove(q.id)} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <button
        type="button"
        onClick={() => setEditing("new")}
        className="flex items-center justify-center gap-2 py-3 border-2 border-dashed border-on-background bg-background hover:bg-on-background hover:text-background font-mono text-xs font-bold uppercase tracking-widest transition-colors duration-150"
      >
        <Icon name="add" size={18} />
        Ajouter une question
      </button>

      {editing && (
        <QuestionEditor
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}

      <QuestionsConcierge questions={items} onChange={refresh} />
    </div>
  );
}

/* ─── Sortable row ─────────────────────────────────────────────── */

function SortableRow({
  q,
  onEdit,
  onDelete,
}: {
  q: ShopQuestion;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: q.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 px-3 py-3 border-2 border-on-background bg-background"
    >
      <button
        type="button"
        className="opacity-60 hover:opacity-100 cursor-grab active:cursor-grabbing touch-none"
        aria-label="Glisser"
        {...attributes}
        {...listeners}
      >
        <Icon name="drag_indicator" />
      </button>
      <div className="flex-1 min-w-0">
        <p className="font-sans font-bold uppercase tracking-tight text-sm truncate">{q.label}</p>
        <DataLabel className="block mt-0.5">
          {KIND_LABELS[q.kind].toUpperCase()} · {q.required ? "REQUIS" : "OPTIONNEL"}
        </DataLabel>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="opacity-60 hover:opacity-100 p-1 transition-opacity"
        aria-label="Modifier"
      >
        <Icon name="edit" size={20} />
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="opacity-60 hover:opacity-100 p-1 transition-opacity"
        aria-label="Supprimer"
      >
        <Icon name="delete" size={20} />
      </button>
    </li>
  );
}

/* ─── Editor sheet ─────────────────────────────────────────────── */

function QuestionEditor({
  initial,
  onClose,
  onSaved,
}: {
  initial: ShopQuestion | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [kind, setKind] = useState<QuestionKind>(initial?.kind ?? "text");
  const [required, setRequired] = useState(initial?.required ?? true);
  const [optionsText, setOptionsText] = useState(() => {
    if (!initial?.options) return "";
    if (Array.isArray(initial.options)) return (initial.options as string[]).join("\n");
    return JSON.stringify(initial.options, null, 2);
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsList = kind === "single" || kind === "multi";
  const needsScale = kind === "scale";

  async function save() {
    setError(null);
    if (!label.trim()) {
      setError("Le libellé est requis.");
      return;
    }

    let options: unknown = null;
    if (needsList) {
      const list = optionsText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      if (list.length < 2) {
        setError("Saisis au moins 2 choix (un par ligne).");
        return;
      }
      options = list;
    } else if (needsScale) {
      options = { min: 1, max: 5, minLabel: "Discret", maxLabel: "Enveloppant" };
    }

    setBusy(true);
    try {
      const body = JSON.stringify({ label, kind, required, options });
      if (initial) {
        await authedFetch(`/api/shops/me/questions/${initial.id}`, {
          method: "PATCH",
          body,
        });
      } else {
        await authedFetch("/api/shops/me/questions", { method: "POST", body });
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-on-background/40 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-screen-md bg-background border-t-2 border-on-background p-6 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between mb-4 pl-4 relative">
          <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-on-background" />
          <div>
            <DataLabel>{initial ? "EDIT_MODE" : "NEW_QUESTION"}</DataLabel>
            <h2 className="font-sans font-black text-2xl tracking-tighter uppercase mt-1">
              {initial ? "Modifier" : "Nouvelle"}
            </h2>
          </div>
          <button onClick={onClose} aria-label="Fermer" className="opacity-60 hover:opacity-100">
            <Icon name="close" />
          </button>
        </header>

        <div className="flex flex-col gap-4">
          <Field label="LIBELLÉ">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full px-3 py-2.5 bg-background border-2 border-on-background text-sm focus:outline-none focus:shadow-[4px_4px_0px_0px_currentColor] placeholder:opacity-40 transition-shadow"
              placeholder="Ex : Quelles familles olfactives vous attirent ?"
            />
          </Field>

          <Field label="TYPE">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as QuestionKind)}
              className="w-full px-3 py-2.5 bg-background border-2 border-on-background font-mono text-sm uppercase focus:outline-none focus:shadow-[4px_4px_0px_0px_currentColor] transition-shadow"
            >
              {Object.entries(KIND_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>

          {needsList && (
            <Field label="CHOIX (UN PAR LIGNE)">
              <textarea
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                rows={6}
                className="w-full px-3 py-2.5 bg-background border-2 border-on-background text-sm font-mono focus:outline-none focus:shadow-[4px_4px_0px_0px_currentColor] placeholder:opacity-40 transition-shadow"
                placeholder={"Floral\nBoisé\nOriental"}
              />
            </Field>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
              className="w-4 h-4 accent-on-background"
            />
            <span className="font-mono text-xs uppercase tracking-widest">RÉPONSE OBLIGATOIRE</span>
          </label>

          {error && (
            <div className="border-2 border-on-background bg-on-background text-background px-3 py-2">
              <p className="font-mono text-xs uppercase tracking-wider">{error}</p>
            </div>
          )}

          <BrutalistButton onClick={save} disabled={busy} size="lg" className="w-full">
            {busy ? "Enregistrement…" : "Enregistrer"}
          </BrutalistButton>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <DataLabel emphasis="high">{label}</DataLabel>
      {children}
    </label>
  );
}
