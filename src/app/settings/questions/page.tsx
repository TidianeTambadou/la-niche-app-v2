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
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Questionnaire</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          Glisse les questions pour les réorganiser. Ce questionnaire est utilisé
          dans « Pour un client » et côté utilisateur quand il choisit ta boutique.
        </p>
      </header>

      {error && (
        <p className="text-sm text-error border border-error/30 bg-error-container/30 px-4 py-3 rounded-xl">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-on-surface-variant">Chargement…</p>
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
        className="flex items-center justify-center gap-2 py-3 border border-dashed border-outline-variant rounded-2xl text-sm font-medium hover:border-primary transition-colors"
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
      className="flex items-center gap-3 px-3 py-3 border border-outline-variant rounded-2xl bg-surface"
    >
      <button
        type="button"
        className="text-outline cursor-grab active:cursor-grabbing touch-none"
        aria-label="Glisser"
        {...attributes}
        {...listeners}
      >
        <Icon name="drag_indicator" />
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{q.label}</p>
        <p className="text-[10px] uppercase tracking-widest text-outline mt-0.5">
          {KIND_LABELS[q.kind]} {q.required ? "· requis" : "· optionnel"}
        </p>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="text-on-surface-variant hover:text-primary p-1"
        aria-label="Modifier"
      >
        <Icon name="edit" size={20} />
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="text-on-surface-variant hover:text-error p-1"
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
      className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-screen-md bg-surface rounded-t-3xl p-6 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{initial ? "Modifier" : "Nouvelle question"}</h2>
          <button onClick={onClose} aria-label="Fermer" className="text-outline">
            <Icon name="close" />
          </button>
        </header>

        <div className="flex flex-col gap-4">
          <Field label="Libellé">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full px-3 py-2 bg-surface-container rounded-xl border border-outline-variant text-sm"
              placeholder="Ex : Quelles familles olfactives vous attirent ?"
            />
          </Field>

          <Field label="Type">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as QuestionKind)}
              className="w-full px-3 py-2 bg-surface-container rounded-xl border border-outline-variant text-sm"
            >
              {Object.entries(KIND_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>

          {needsList && (
            <Field label="Choix (un par ligne)">
              <textarea
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                rows={6}
                className="w-full px-3 py-2 bg-surface-container rounded-xl border border-outline-variant text-sm font-mono"
                placeholder={"Floral\nBoisé\nOriental"}
              />
            </Field>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
            />
            Réponse obligatoire
          </label>

          {error && <p className="text-sm text-error">{error}</p>}

          <button
            type="button"
            disabled={busy}
            onClick={save}
            className="w-full py-3 bg-primary text-on-primary rounded-full text-sm font-bold uppercase tracking-widest disabled:opacity-50"
          >
            {busy ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs uppercase tracking-widest text-outline">{label}</span>
      {children}
    </label>
  );
}
