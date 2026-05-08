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
      <p className="font-mono text-xs uppercase tracking-widest opacity-60 text-center py-6">
        REPORT_UNAVAILABLE · RETRY_LATER
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* 1. Headline */}
      {r.summary && (
        <Section title="POUR LE VENDEUR" delayMs={80}>
          <p className="font-sans font-bold uppercase tracking-tight text-base leading-relaxed">{r.summary}</p>
          {r.signature && (
            <p className="font-cormorant italic text-base leading-relaxed border-l-2 border-on-background pl-3 opacity-80">
              « {r.signature} »
            </p>
          )}
        </Section>
      )}

      {/* 2. ADN olfactif synthétisé */}
      {(p.dominant_families?.length || p.key_notes?.length) && (
        <Section title="ADN OLFACTIF" delayMs={160}>
          {p.personality && (
            <p className="font-cormorant italic text-base leading-relaxed">« {p.personality} »</p>
          )}
          {p.dominant_families && p.dominant_families.length > 0 && (
            <ChipRow label="FAMILLES" values={p.dominant_families} />
          )}
          {p.dominant_accords && p.dominant_accords.length > 0 && (
            <ChipRow label="ACCORDS DOMINANTS" values={p.dominant_accords} />
          )}
          {p.key_notes && p.key_notes.length > 0 && (
            <ChipRow label="NOTES PHARES" values={p.key_notes} variant="positive" />
          )}
          {p.avoid_notes && p.avoid_notes.length > 0 && (
            <ChipRow label="NOTES À ÉVITER" values={p.avoid_notes} variant="negative" />
          )}
          {p.intensity_label && (
            <p className="font-mono text-xs uppercase tracking-wider opacity-70">
              SILLAGE : <span className="font-bold opacity-100">{p.intensity_label}</span>
              {typeof p.intensity_score === "number" && ` · ${p.intensity_score}/5`}
            </p>
          )}
          {p.wear_context && p.wear_context.length > 0 && (
            <ChipRow label="OCCASIONS" values={p.wear_context} />
          )}
        </Section>
      )}

      {/* 3. Références à proposer */}
      {r.loved_references && r.loved_references.length > 0 && (
        <Section title="RÉFÉRENCES QUI DEVRAIENT LUI PARLER" delayMs={240}>
          <ul className="flex flex-col gap-3">
            {r.loved_references.map((ref, i) => (
              <li key={i} className="border-l-2 border-on-background pl-3">
                <p className="font-sans font-bold uppercase tracking-tight text-sm">
                  {ref.name}
                  {ref.brand && (
                    <span className="font-normal opacity-60"> — {ref.brand}</span>
                  )}
                  {ref.family && (
                    <span className="ml-2 font-mono text-[10px] uppercase tracking-widest opacity-60">
                      {ref.family}
                    </span>
                  )}
                </p>
                {ref.why && (
                  <p className="text-sm opacity-80 mt-0.5 leading-relaxed">{ref.why}</p>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* 4. Références à éviter */}
      {r.rejected_references && r.rejected_references.length > 0 && (
        <Section title="À ÉVITER DE PITCHER" delayMs={320}>
          <ul className="flex flex-col gap-3">
            {r.rejected_references.map((ref, i) => (
              <li
                key={i}
                className="border-l-2 border-on-background pl-3 line-through decoration-[1px]"
              >
                <p className="font-sans font-bold uppercase tracking-tight text-sm no-underline">
                  {ref.name}
                  {ref.brand && (
                    <span className="font-normal opacity-60"> — {ref.brand}</span>
                  )}
                  {ref.family && (
                    <span className="ml-2 font-mono text-[10px] uppercase tracking-widest opacity-60">
                      {ref.family}
                    </span>
                  )}
                </p>
                {ref.why && (
                  <p className="text-sm opacity-80 mt-0.5 leading-relaxed no-underline">
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
        <Section title="CONSEIL VENTE" delayMs={400}>
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
      className="report-section flex flex-col gap-3 border-2 border-on-background bg-background px-5 py-4 shadow-[4px_4px_0px_0px_currentColor]"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <h2 className="font-mono text-xs uppercase tracking-widest font-bold opacity-100">
        {title}
      </h2>
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
  // Variants restent monochromes : positive = inversé (bg noir), negative = barré.
  const cls =
    variant === "positive"
      ? "border-on-background bg-on-background text-background font-bold"
      : variant === "negative"
        ? "border-on-background line-through opacity-60"
        : "border-on-background";
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-widest opacity-60 mb-1.5">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span
            key={v}
            className={`font-mono text-[11px] uppercase tracking-wider px-2 py-0.5 border-2 ${cls}`}
          >
            {v}
          </span>
        ))}
      </div>
    </div>
  );
}
