"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { Icon } from "@/components/Icon";
import {
  generateGuidedRoute,
  shopOpenNow,
  useData,
  useShop,
  useShopStock,
} from "@/lib/data";
import { useStore } from "@/lib/store";

const TIME_OPTIONS = [5, 10, 20, 30] as const;

export function GuidedShopSetup({ shopId }: { shopId: string }) {
  const router = useRouter();
  const { loading, error } = useData();
  const shop = useShop(shopId);
  const stock = useShopStock(shopId);
  const { startBalade } = useStore();
  const [selected, setSelected] = useState<(typeof TIME_OPTIONS)[number] | null>(
    null,
  );

  const previewRoute = useMemo(() => {
    if (!selected) return [];
    return generateGuidedRoute(stock, selected);
  }, [stock, selected]);

  function start() {
    if (!selected || !shop) return;
    startBalade({
      mode: "guided",
      shopId: shop.id,
      route: previewRoute,
      timeBudget: selected,
    });
    router.push("/balade/guided/active");
  }

  if (loading) {
    return (
      <div className="px-6 pt-12 text-center">
        <p className="text-xs text-outline uppercase tracking-widest">
          Chargement…
        </p>
      </div>
    );
  }

  if (!shop) {
    return (
      <div className="px-6 pt-12 text-center">
        <p className="text-sm text-on-surface-variant mb-6">
          {error
            ? `Impossible de charger la boutique : ${error}`
            : "Boutique introuvable."}
        </p>
        <Link
          href="/balade/guided"
          className="text-[10px] uppercase tracking-widest font-bold border-b border-primary pb-0.5"
        >
          Retour à la liste
        </Link>
      </div>
    );
  }

  const open = shopOpenNow(shop);
  const addressLine = [shop.address_line, shop.postal_code, shop.city]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="px-6 pt-4 pb-12">
      <header className="mb-8">
        <span className="text-[10px] uppercase tracking-[0.3em] text-outline mb-2 block">
          Balade guidée · 02
        </span>
        <h1 className="text-3xl font-bold tracking-tighter leading-none mb-2">
          {shop.name}
        </h1>
        {addressLine && (
          <p className="text-xs text-on-surface-variant">{addressLine}</p>
        )}
        <div className="mt-3 flex items-center gap-3">
          <span className="text-[10px] font-mono text-outline">
            {stock.length} parfums en stock
          </span>
          <span className="text-[10px] font-mono text-outline">·</span>
          <span
            className={
              open
                ? "text-[10px] uppercase tracking-widest text-primary font-bold"
                : "text-[10px] uppercase tracking-widest text-outline"
            }
          >
            {open ? "Ouvert" : "Fermé"}
          </span>
        </div>
      </header>

      {stock.length === 0 ? (
        <section className="border border-outline-variant/40 bg-surface-container-low p-6 text-center mb-10">
          <p className="text-sm text-on-surface-variant">
            Cette boutique n&apos;a pas encore de stock dans le CRM. Reviens plus
            tard ou choisis une autre boutique.
          </p>
        </section>
      ) : (
        <>
          <section className="mb-10">
            <div className="flex items-center gap-3 mb-3">
              <Icon name="face_6" size={16} />
              <span className="text-[10px] uppercase tracking-widest font-bold">
                Concierge
              </span>
            </div>
            <p className="text-base font-light leading-relaxed text-on-surface-variant max-w-md">
              Combien de temps as-tu pour cette balade ?
            </p>
          </section>

          <section className="mb-10">
            <div className="grid grid-cols-2 gap-2">
              {TIME_OPTIONS.map((t) => {
                const active = selected === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setSelected(t)}
                    className={clsx(
                      "py-6 border text-center transition-all",
                      active
                        ? "bg-primary border-primary text-on-primary"
                        : "border-outline-variant hover:border-primary",
                    )}
                  >
                    <p className="text-3xl font-bold tracking-tight font-mono">
                      {t}
                      {t === 30 ? "+" : ""}
                    </p>
                    <p
                      className={clsx(
                        "text-[10px] uppercase tracking-widest mt-1",
                        active ? "text-on-primary/70" : "text-outline",
                      )}
                    >
                      minutes
                    </p>
                  </button>
                );
              })}
            </div>
          </section>

          {selected && previewRoute.length > 0 && (
            <section className="mb-10 border border-outline-variant p-5">
              <p className="text-[10px] uppercase tracking-[0.2em] text-outline mb-2">
                Parcours suggéré
              </p>
              <p className="text-2xl font-bold tracking-tight mb-4">
                {previewRoute.length} parfum
                {previewRoute.length > 1 ? "s" : ""} · ~{selected}min
              </p>
              <ol className="space-y-2">
                {previewRoute.map((id, i) => {
                  const f = stock.find((s) => s.key === id);
                  if (!f) return null;
                  return (
                    <li
                      key={id}
                      className="flex items-center gap-3 text-sm border-t border-outline-variant/40 pt-2 first:border-0 first:pt-0"
                    >
                      <span className="text-[10px] font-mono text-outline w-6">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="font-medium flex-1 truncate">
                        {f.name}
                      </span>
                      <span className="text-[10px] uppercase tracking-widest text-outline">
                        {f.brand}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          <button
            type="button"
            onClick={start}
            disabled={!selected || previewRoute.length === 0}
            className="w-full py-4 bg-primary text-on-primary rounded-full text-xs uppercase tracking-[0.2em] font-bold active:scale-95 transition-all disabled:opacity-30 flex items-center justify-center gap-2"
          >
            <Icon name="play_arrow" size={16} />
            Démarrer le parcours
          </button>
        </>
      )}
    </div>
  );
}
