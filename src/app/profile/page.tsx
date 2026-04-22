"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { useFragrances } from "@/lib/data";
import {
  BUDGET_VULGAR,
  FAMILY_VULGAR,
  INTENSITY_VULGAR,
  MOMENT_VULGAR,
  OCCASION_VULGAR,
  readProfileFromUser,
} from "@/lib/profile";

export default function ProfilePage() {
  const router = useRouter();
  const { wishlist, history } = useStore();
  const { user, loading: authLoading, signOut } = useAuth();
  const fragrances = useFragrances();
  const [signingOut, setSigningOut] = useState(false);

  const profile = readProfileFromUser(user);

  async function onSignOut() {
    setSigningOut(true);
    try {
      await signOut();
      router.push("/login");
    } finally {
      setSigningOut(false);
    }
  }

  const collections = wishlist
    .map((w) => fragrances.find((f) => f.key === w.fragranceId))
    .filter((x): x is (typeof fragrances)[number] => Boolean(x))
    .slice(0, 4);

  return (
    <div className="px-6 pt-4 pb-12">
      {/* Step indicator */}
      <div className="mb-10 flex items-center gap-6">
        <span className="text-[10px] uppercase tracking-[0.3em] font-semibold">
          Profil
        </span>
        <div className="h-px flex-1 bg-outline-variant">
          <div className="h-px w-2/3 bg-primary" />
        </div>
        <span className="text-[10px] uppercase tracking-[0.3em] text-on-surface-variant">
          Synthèse
        </span>
      </div>

      {/* Hero */}
      <section className="mb-10">
        <h1 className="text-5xl font-extralight tracking-tighter leading-[0.9] mb-6">
          ADN
          <br />
          <span className="italic font-serif">Olfactif</span>
        </h1>
        <p className="text-sm text-on-surface-variant max-w-md leading-relaxed">
          Ton signature olfactive. Plus tu la précises, plus les recommandations
          collent à toi.
        </p>
      </section>

      {/* Identity card */}
      <section className="mb-10 border border-outline-variant p-5">
        {authLoading ? (
          <p className="text-[10px] uppercase tracking-widest text-outline">
            Chargement…
          </p>
        ) : user ? (
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.2em] text-outline mb-1">
                Connecté
              </p>
              <p className="text-base font-medium truncate">{user.email}</p>
              <p className="text-[10px] uppercase tracking-widest text-outline mt-1">
                Compte créé le{" "}
                {new Date(user.created_at).toLocaleDateString("fr-FR", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            </div>
            <button
              type="button"
              onClick={onSignOut}
              disabled={signingOut}
              className="text-[10px] uppercase tracking-widest font-bold border border-outline-variant px-4 py-2 hover:border-error hover:text-error transition-colors disabled:opacity-40 flex items-center gap-1"
            >
              <Icon name="logout" size={14} />
              {signingOut ? "…" : "Déconnexion"}
            </button>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.2em] text-outline mb-1">
                Non connecté
              </p>
              <p className="text-sm text-on-surface-variant max-w-xs">
                Connecte-toi pour synchroniser ta wishlist, tes balades et ton
                ADN olfactif sur tous tes appareils.
              </p>
            </div>
            <Link
              href="/login?redirect=/profile"
              className="text-[10px] uppercase tracking-widest font-bold bg-primary text-on-primary px-4 py-2 active:scale-95 transition-transform whitespace-nowrap"
            >
              Connexion
            </Link>
          </div>
        )}
      </section>

      {/* Stats */}
      <section className="mb-12 grid grid-cols-3 gap-px bg-outline-variant/40">
        <Stat label="Wishlist" value={wishlist.length} />
        <Stat label="Balades" value={history.length} />
        <Stat
          label="Familles"
          value={profile?.preferred_families.length ?? 0}
        />
      </section>

      {/* Olfactive profile (saved) */}
      <section className="mb-12">
        <div className="flex justify-between items-end mb-4 border-b border-outline-variant/40 pb-3">
          <h2 className="text-[11px] uppercase tracking-[0.4em] font-bold">
            Mon ADN
          </h2>
          {profile && (
            <span className="text-[10px] font-mono text-outline">
              MAJ{" "}
              {new Date(profile.completed_at).toLocaleDateString("fr-FR", {
                day: "2-digit",
                month: "short",
              })}
            </span>
          )}
        </div>

        {profile ? (
          <div className="border border-outline-variant divide-y divide-outline-variant/40">
            <ProfileBlock label="Univers olfactif">
              <Chips
                items={profile.preferred_families.map((f) => ({
                  emoji: FAMILY_VULGAR[f].emoji,
                  label: FAMILY_VULGAR[f].title,
                }))}
              />
            </ProfileBlock>
            <ProfileBlock label="Sillage">
              <Chips
                items={[
                  {
                    emoji: INTENSITY_VULGAR[profile.intensity_preference].emoji,
                    label:
                      INTENSITY_VULGAR[profile.intensity_preference].title,
                  },
                ]}
              />
            </ProfileBlock>
            <ProfileBlock label="Moments">
              <Chips
                items={profile.moments.map((m) => ({
                  emoji: MOMENT_VULGAR[m].emoji,
                  label: MOMENT_VULGAR[m].title,
                }))}
              />
            </ProfileBlock>
            <ProfileBlock label="Occasions">
              <Chips
                items={profile.occasions.map((o) => ({
                  emoji: OCCASION_VULGAR[o].emoji,
                  label: OCCASION_VULGAR[o].title,
                }))}
              />
            </ProfileBlock>
            <ProfileBlock label="Budget">
              <Chips
                items={[{ label: BUDGET_VULGAR[profile.budget].title }]}
              />
            </ProfileBlock>
            <div className="p-4">
              <Link
                href="/onboarding"
                className="w-full py-3 border border-outline-variant rounded-full text-[10px] uppercase tracking-widest font-bold hover:border-primary text-center transition-all flex items-center justify-center gap-2"
              >
                <Icon name="biotech" size={14} />
                Refaire mon profil
              </Link>
            </div>
          </div>
        ) : user ? (
          <div className="border border-outline-variant p-6 text-center">
            <Icon
              name="biotech"
              size={36}
              className="text-on-surface-variant mb-3 mx-auto"
            />
            <p className="text-sm text-on-surface-variant max-w-sm mx-auto mb-5">
              Tu n&apos;as pas encore défini ton ADN olfactif. 5 questions
              vulgarisées pour qu&apos;on te recommande ce qui te correspond
              vraiment.
            </p>
            <Link
              href="/onboarding"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-on-primary rounded-full text-[10px] uppercase tracking-widest font-bold active:scale-95 transition-transform"
            >
              <Icon name="play_arrow" size={14} />
              Démarrer le profilage
            </Link>
          </div>
        ) : (
          <p className="text-sm text-on-surface-variant">
            Connecte-toi pour définir ton ADN olfactif.
          </p>
        )}
      </section>

      {/* Collections */}
      <section className="mb-12">
        <div className="flex justify-between items-end mb-4">
          <h2 className="text-[10px] uppercase tracking-[0.2em] font-bold">
            Mes collections
          </h2>
          <Link
            href="/wishlist"
            className="text-[10px] uppercase tracking-widest font-bold border-b border-primary pb-0.5"
          >
            Voir tout
          </Link>
        </div>
        {collections.length === 0 ? (
          <p className="text-sm text-on-surface-variant">
            Aucun parfum encore enregistré.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {collections.map((f) => (
              <Link
                key={f.key}
                href={`/fragrance/${f.key}`}
                className="block bg-surface-container-low aspect-[3/4] overflow-hidden relative"
              >
                {f.imageUrl && (
                  <img
                    src={f.imageUrl}
                    alt={f.name}
                    className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-700"
                  />
                )}
                <div className="absolute bottom-0 left-0 right-0 p-3 bg-background/80 backdrop-blur-sm">
                  <p className="text-xs font-medium truncate">{f.name}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* History */}
      <section>
        <h2 className="text-[10px] uppercase tracking-[0.2em] font-bold mb-4">
          Historique des balades
        </h2>
        {history.length === 0 ? (
          <p className="text-sm text-on-surface-variant">
            Aucune balade terminée pour le moment.
          </p>
        ) : (
          <ul className="border-t border-outline-variant/40">
            {history.map((b) => (
              <li
                key={b.id}
                className="py-4 border-b border-outline-variant/40"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">
                      Balade {b.mode === "free" ? "libre" : "guidée"}
                    </p>
                    <p className="text-[10px] uppercase tracking-widest text-outline">
                      {new Date(b.finishedAt).toLocaleDateString("fr-FR", {
                        day: "2-digit",
                        month: "short",
                      })}{" "}
                      · {b.tested.length} parfum
                      {b.tested.length > 1 ? "s" : ""}
                    </p>
                  </div>
                  <span className="text-[10px] font-mono text-outline">
                    {b.placements.length} pose
                    {b.placements.length > 1 ? "s" : ""}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-background p-5">
      <p className="text-[9px] uppercase tracking-widest text-outline mb-2">
        {label}
      </p>
      <p className="text-3xl font-bold tracking-tight font-mono">{value}</p>
    </div>
  );
}

function ProfileBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="p-4">
      <p className="text-[10px] uppercase tracking-widest text-outline mb-3">
        {label}
      </p>
      {children}
    </div>
  );
}

function Chips({
  items,
}: {
  items: { emoji?: string; label: string }[];
}) {
  if (items.length === 0) {
    return <p className="text-xs text-outline italic">—</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it, i) => (
        <span
          key={`${it.label}-${i}`}
          className="px-3 py-1.5 bg-surface-container-high rounded-full text-[11px] tracking-wide flex items-center gap-1.5"
        >
          {it.emoji && <span>{it.emoji}</span>}
          <span className="font-medium">{it.label}</span>
        </span>
      ))}
    </div>
  );
}
