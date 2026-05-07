"use client";

/**
 * Renders the AI-generated olfactive profile + sales-pitch report. Same
 * visual language as v1's FriendReport screen :
 *   1. Summary headline
 *   2. Signature paragraph
 *   3. ADN olfactif chips (families, accords, key_notes, avoid_notes,
 *      sillage, occasions)
 *   4. Loved references (3-5 perfumes that should appeal)
 *   5. Rejected references (perfumes to avoid pitching)
 *   6. Sales advice paragraph
 *
 * Reused by /pour-un-client (inline at wizard end) and /clients/[id]
 * (full fiche detail). Shape is identical to what /api/clients returns.
 */

type ProfileShape = {
  dominant_families?: string[];
  dominant_accords?: string[];
  key_notes?: string[];
  avoid_notes?: string[];
  personality?: string;
  intensity_label?: string;
  intensity_score?: number;
  wear_context?: string[];
};

type PerfumeRef = {
  brand?: string;
  name?: string;
  family?: string;
  why?: string;
};

type ReportShape = {
  summary?: string;
  signature?: string;
  loved_references?: PerfumeRef[];
  rejected_references?: PerfumeRef[];
  sales_advice?: string;
};

type Props = {
  profile: ProfileShape | null | undefined;
  report: ReportShape | null | undefined;
};

export function ClientReport({ profile, report }: Props) {
  const p = profile ?? {};
  const r = report ?? {};

  const hasAnything =
    r.summary ||
    r.signature ||
    p.dominant_families?.length ||
    r.loved_references?.length ||
    r.rejected_references?.length ||
    r.sales_advice;

  if (!hasAnything) {
    return (
      <p className="text-sm text-on-surface-variant text-center py-6">
        Le rapport n'a pas pu être généré. Réessaie plus tard depuis la
        fiche du client.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* 1. Headline */}
      {r.summary && (
        <Section title="Pour le vendeur" delayMs={80}>
          <p className="text-sm font-semibold leading-relaxed">{r.summary}</p>
          {r.signature && (
            <p className="text-sm leading-relaxed text-on-surface-variant border-l-2 border-outline-variant pl-3">
              {r.signature}
            </p>
          )}
        </Section>
      )}

      {/* 2. ADN olfactif synthétisé */}
      {(p.dominant_families?.length || p.key_notes?.length) && (
        <Section title="ADN olfactif" delayMs={160}>
          {p.personality && (
            <p className="text-sm italic leading-relaxed">{p.personality}</p>
          )}
          {p.dominant_families && p.dominant_families.length > 0 && (
            <ChipRow label="Familles" values={p.dominant_families} />
          )}
          {p.dominant_accords && p.dominant_accords.length > 0 && (
            <ChipRow label="Accords dominants" values={p.dominant_accords} />
          )}
          {p.key_notes && p.key_notes.length > 0 && (
            <ChipRow label="Notes phares" values={p.key_notes} variant="positive" />
          )}
          {p.avoid_notes && p.avoid_notes.length > 0 && (
            <ChipRow label="Notes à éviter" values={p.avoid_notes} variant="negative" />
          )}
          {p.intensity_label && (
            <p className="text-xs text-on-surface-variant">
              Sillage : <span className="font-medium">{p.intensity_label}</span>
              {typeof p.intensity_score === "number" && ` (${p.intensity_score}/5)`}
            </p>
          )}
          {p.wear_context && p.wear_context.length > 0 && (
            <ChipRow label="Occasions" values={p.wear_context} />
          )}
        </Section>
      )}

      {/* 3. Références à proposer */}
      {r.loved_references && r.loved_references.length > 0 && (
        <Section title="Références qui devraient lui parler" delayMs={240}>
          <ul className="flex flex-col gap-3">
            {r.loved_references.map((ref, i) => (
              <li key={i} className="border-l-2 border-primary/60 pl-3">
                <p className="text-sm font-semibold">
                  {ref.name}
                  {ref.brand && (
                    <span className="font-normal text-on-surface-variant">
                      {" "}— {ref.brand}
                    </span>
                  )}
                  {ref.family && (
                    <span className="ml-2 text-[10px] uppercase tracking-widest text-outline">
                      {ref.family}
                    </span>
                  )}
                </p>
                {ref.why && (
                  <p className="text-sm text-on-surface-variant mt-0.5 leading-relaxed">
                    {ref.why}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* 4. Références à éviter */}
      {r.rejected_references && r.rejected_references.length > 0 && (
        <Section title="À éviter de pitcher" delayMs={320}>
          <ul className="flex flex-col gap-3">
            {r.rejected_references.map((ref, i) => (
              <li key={i} className="border-l-2 border-error/60 pl-3">
                <p className="text-sm font-semibold">
                  {ref.name}
                  {ref.brand && (
                    <span className="font-normal text-on-surface-variant">
                      {" "}— {ref.brand}
                    </span>
                  )}
                  {ref.family && (
                    <span className="ml-2 text-[10px] uppercase tracking-widest text-outline">
                      {ref.family}
                    </span>
                  )}
                </p>
                {ref.why && (
                  <p className="text-sm text-on-surface-variant mt-0.5 leading-relaxed">
                    {ref.why}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* 5. Conseil vente */}
      {r.sales_advice && (
        <Section title="Conseil vente" delayMs={400}>
          <p className="text-sm leading-relaxed">{r.sales_advice}</p>
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  children,
  delayMs = 0,
}: {
  title: string;
  children: React.ReactNode;
  delayMs?: number;
}) {
  return (
    <section
      className="report-section flex flex-col gap-3 border border-outline-variant rounded-3xl px-5 py-4"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <h2 className="text-xs uppercase tracking-widest text-outline">{title}</h2>
      {children}
    </section>
  );
}

function ChipRow({
  label,
  values,
  variant = "neutral",
}: {
  label: string;
  values: string[];
  variant?: "neutral" | "positive" | "negative";
}) {
  const cls =
    variant === "positive"
      ? "border-primary/40 bg-primary-container/40"
      : variant === "negative"
        ? "border-error/40 bg-error-container/30"
        : "border-outline-variant";
  return (
    <div>
      <p className="text-xs uppercase tracking-widest text-outline mb-1.5">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span
            key={v}
            className={`text-[11px] px-2 py-0.5 border rounded-full ${cls}`}
          >
            {v}
          </span>
        ))}
      </div>
    </div>
  );
}
