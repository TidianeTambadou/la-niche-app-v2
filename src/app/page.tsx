"use client";

import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PerfumeCard } from "@/components/PerfumeCard";
import {
  scentOfTheDay,
  shopOpenNow,
  useData,
  useFragrances,
  useShops,
} from "@/lib/data";

export default function HomePage() {
  const { loading, error } = useData();
  const shops = useShops();
  const fragrances = useFragrances();
  const today = scentOfTheDay(fragrances);
  const suggestions = today
    ? fragrances.filter((f) => f.key !== today.key).slice(0, 6)
    : fragrances.slice(0, 6);

  return (
    <div className="px-6 pt-4 pb-12">
      {/* Welcome */}
      <section className="mb-10">
        <span className="text-[10px] uppercase tracking-[0.3em] text-outline mb-3 block">
          Bienvenue
        </span>
        <h1 className="text-4xl font-bold tracking-tighter leading-none">
          Quel parcours olfactif aujourd&apos;hui ?
        </h1>
      </section>

      {error && (
        <div className="mb-8 border border-error/40 bg-error-container/20 px-4 py-3">
          <p className="text-xs text-error">
            Erreur de chargement : {error}
          </p>
        </div>
      )}

      {/* Scent of the Day */}
      <section className="mb-12">
        <div className="flex justify-between items-end mb-4">
          <h2 className="text-[10px] uppercase tracking-[0.2em] font-bold">
            Scent of the day
          </h2>
          <span className="text-[10px] font-mono text-outline">
            {new Date().toLocaleDateString("fr-FR", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </span>
        </div>
        {loading ? (
          <SkeletonFeature />
        ) : today ? (
          <PerfumeCard fragrance={today} variant="feature" origin="manual" />
        ) : (
          <EmptyBlock label="Aucun parfum dans le catalogue. Ajoute du stock depuis le CRM." />
        )}
      </section>

      {/* Quick actions */}
      <section className="mb-12">
        <h2 className="text-[10px] uppercase tracking-[0.2em] font-bold mb-4">
          Actions rapides
        </h2>
        <div className="grid grid-cols-3 gap-px bg-outline-variant/40">
          <QuickAction href="/search" icon="search" label="Search" sublabel="IA" />
          <QuickAction
            href="/scan"
            icon="qr_code_scanner"
            label="Scan"
            sublabel="Caméra"
          />
          <QuickAction
            href="/balade"
            icon="directions_walk"
            label="Balade"
            sublabel="Test"
          />
        </div>
      </section>

      {/* Suggestions */}
      <section className="mb-12">
        <div className="flex justify-between items-end mb-4">
          <h2 className="text-[10px] uppercase tracking-[0.2em] font-bold">
            Sélection pour toi
          </h2>
          <Link
            href="/search"
            className="text-[10px] uppercase tracking-widest font-bold border-b border-primary pb-0.5"
          >
            Voir tout
          </Link>
        </div>
        {loading ? (
          <SkeletonRail />
        ) : suggestions.length > 0 ? (
          <div className="flex gap-4 overflow-x-auto hide-scrollbar -mx-6 px-6 pb-2">
            {suggestions.map((f) => (
              <PerfumeCard
                key={f.key}
                fragrance={f}
                variant="compact"
                origin="manual"
              />
            ))}
          </div>
        ) : (
          <EmptyBlock label="Aucune suggestion pour le moment." />
        )}
      </section>

      {/* Nearby shops */}
      <section>
        <div className="flex justify-between items-end mb-4">
          <h2 className="text-[10px] uppercase tracking-[0.2em] font-bold">
            Boutiques
          </h2>
          <Link
            href="/balade"
            className="text-[10px] uppercase tracking-widest font-bold border-b border-primary pb-0.5"
          >
            Balade guidée
          </Link>
        </div>
        {loading ? (
          <SkeletonList />
        ) : shops.length === 0 ? (
          <EmptyBlock label="Aucune boutique enregistrée. Crée-en une depuis le CRM." />
        ) : (
          <ul className="border-t border-outline-variant/40">
            {shops.map((shop) => {
              const open = shopOpenNow(shop);
              const ref = `LN-${shop.id.slice(0, 6).toUpperCase()}`;
              const addressLine = [shop.address_line, shop.postal_code, shop.city]
                .filter(Boolean)
                .join(", ");
              return (
                <li key={shop.id}>
                  <Link
                    href={`/balade/guided/${shop.id}`}
                    className="flex items-start justify-between py-5 border-b border-outline-variant/40 group"
                  >
                    <div className="min-w-0 pr-3">
                      <p className="text-[9px] font-mono text-outline mb-1">
                        {ref}
                      </p>
                      <h3 className="text-base font-semibold tracking-tight truncate">
                        {shop.name}
                      </h3>
                      {addressLine && (
                        <p className="text-xs text-on-surface-variant mt-1 line-clamp-2">
                          {addressLine}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <span
                        className={
                          open
                            ? "text-[10px] uppercase tracking-widest font-bold text-primary"
                            : "text-[10px] uppercase tracking-widest text-outline"
                        }
                      >
                        {open ? "Ouvert" : "Fermé"}
                      </span>
                      <Icon name="arrow_forward" size={18} />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function QuickAction({
  href,
  icon,
  label,
  sublabel,
}: {
  href: string;
  icon: string;
  label: string;
  sublabel: string;
}) {
  return (
    <Link
      href={href}
      className="bg-background hover:bg-primary group p-6 aspect-square flex flex-col justify-between transition-colors duration-300"
    >
      <Icon
        name={icon}
        size={22}
        className="text-on-background group-hover:text-on-primary transition-colors"
      />
      <div>
        <p className="text-sm uppercase tracking-widest font-medium text-on-background group-hover:text-on-primary transition-colors">
          {label}
        </p>
        <p className="text-[9px] uppercase tracking-widest text-outline group-hover:text-on-primary/60 mt-1">
          {sublabel}
        </p>
      </div>
    </Link>
  );
}

function SkeletonFeature() {
  return (
    <div className="aspect-[4/5] bg-surface-container-low animate-pulse" />
  );
}

function SkeletonRail() {
  return (
    <div className="flex gap-4 overflow-hidden -mx-6 px-6">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="min-w-[180px] aspect-[3/4] bg-surface-container-low animate-pulse"
        />
      ))}
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-20 bg-surface-container-low animate-pulse"
        />
      ))}
    </div>
  );
}

function EmptyBlock({ label }: { label: string }) {
  return (
    <div className="border border-outline-variant/40 bg-surface-container-low p-6 text-center">
      <p className="text-xs text-on-surface-variant">{label}</p>
    </div>
  );
}
