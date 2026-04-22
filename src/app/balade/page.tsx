"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useStore } from "@/lib/store";

export default function BaladeEntryPage() {
  const router = useRouter();
  const { activeBalade, cancelBalade, startBalade } = useStore();

  function startFree() {
    startBalade({ mode: "free" });
    router.push("/balade/free");
  }

  return (
    <div className="px-6 pt-4 pb-12">
      <header className="mb-10">
        <span className="text-[10px] uppercase tracking-[0.3em] text-outline mb-3 block">
          Expérience
        </span>
        <h1 className="text-4xl font-bold tracking-tighter leading-none">
          Balade
        </h1>
        <p className="text-sm text-on-surface-variant mt-3 max-w-md leading-relaxed">
          Une balade est un test corporel structuré. Choisis ton format avant de
          commencer.
        </p>
      </header>

      {activeBalade && (
        <section className="mb-8 border border-outline-variant p-5 bg-surface-container-low">
          <p className="text-[10px] uppercase tracking-[0.2em] text-outline mb-2">
            Balade en cours
          </p>
          <p className="text-sm font-medium mb-4">
            {activeBalade.mode === "free" ? "Balade libre" : "Balade guidée"} ·{" "}
            {activeBalade.tested.length} parfum
            {activeBalade.tested.length > 1 ? "s" : ""} testé
            {activeBalade.tested.length > 1 ? "s" : ""}
          </p>
          <div className="flex gap-2">
            <Link
              href={
                activeBalade.mode === "free"
                  ? "/balade/free"
                  : "/balade/guided/active"
              }
              className="flex-1 py-3 bg-primary text-on-primary rounded-full text-[10px] uppercase tracking-widest font-bold text-center active:scale-95 transition-all"
            >
              Reprendre
            </Link>
            <Link
              href="/balade/end"
              className="flex-1 py-3 border border-outline-variant rounded-full text-[10px] uppercase tracking-widest font-bold text-center hover:border-primary transition-all"
            >
              Terminer
            </Link>
            <button
              type="button"
              onClick={cancelBalade}
              className="px-4 py-3 border border-outline-variant rounded-full text-[10px] uppercase tracking-widest font-bold text-outline hover:text-error hover:border-error transition-all"
              aria-label="Annuler la balade"
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        </section>
      )}

      <section className="space-y-px bg-outline-variant/40">
        <button
          type="button"
          onClick={startFree}
          className="w-full bg-background hover:bg-primary group p-8 text-left transition-colors duration-300 flex justify-between items-center"
          disabled={Boolean(activeBalade)}
        >
          <div className="flex-1">
            <span className="text-[10px] font-mono text-outline group-hover:text-on-primary/60 mb-2 block">
              01 / FREE
            </span>
            <h2 className="text-2xl font-semibold tracking-tighter group-hover:text-on-primary mb-2">
              Balade libre
            </h2>
            <p className="text-sm text-on-surface-variant group-hover:text-on-primary/70 max-w-md leading-relaxed">
              Tu choisis tes parfums (Search ou Scan) et leur position sur le
              corps. Aucun cadre temps.
            </p>
          </div>
          <Icon
            name="arrow_forward"
            size={20}
            className="text-on-background group-hover:text-on-primary"
          />
        </button>

        <Link
          href="/balade/guided"
          className="w-full bg-background hover:bg-primary group p-8 text-left transition-colors duration-300 flex justify-between items-center"
        >
          <div className="flex-1">
            <span className="text-[10px] font-mono text-outline group-hover:text-on-primary/60 mb-2 block">
              02 / GUIDED
            </span>
            <h2 className="text-2xl font-semibold tracking-tighter group-hover:text-on-primary mb-2">
              Balade guidée
            </h2>
            <p className="text-sm text-on-surface-variant group-hover:text-on-primary/70 max-w-md leading-relaxed">
              En boutique. Choisis le lieu, indique ton temps disponible :
              l&apos;IA génère un parcours optimisé.
            </p>
          </div>
          <Icon
            name="arrow_forward"
            size={20}
            className="text-on-background group-hover:text-on-primary"
          />
        </Link>
      </section>
    </div>
  );
}
