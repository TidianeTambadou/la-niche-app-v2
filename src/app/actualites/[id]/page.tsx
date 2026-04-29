import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/Icon";
import { findNewsById, formatNewsDate, latestNews } from "@/lib/news";

export async function generateStaticParams() {
  return latestNews().map((n) => ({ id: n.id }));
}

export default async function ActualitePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const item = findNewsById(id);
  if (!item) notFound();

  const paragraphs = (item.body ?? item.excerpt)
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const related = latestNews()
    .filter((n) => n.id !== item.id)
    .slice(0, 3);

  return (
    <article className="px-0 pb-16">
      {/* Back button */}
      <div className="px-6 pt-4 pb-2">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.25em] text-outline hover:text-on-background transition-colors"
        >
          <Icon name="arrow_back" size={14} />
          Retour
        </Link>
      </div>

      {/* Hero image */}
      <div className="relative w-full aspect-[16/10] bg-surface-container-low overflow-hidden mt-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.imageUrl}
          alt=""
          className="w-full h-full object-cover grayscale contrast-110"
        />
        <div className="absolute top-3 left-3 flex flex-wrap gap-1">
          {item.tags.map((t) => (
            <span
              key={t}
              className="text-[9px] uppercase tracking-widest font-mono bg-background/90 px-2 py-0.5 border border-outline-variant"
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* Meta strip */}
      <div className="px-6 pt-6 pb-4 flex items-center gap-3 text-[10px] uppercase tracking-[0.2em] text-outline font-mono">
        <span className="text-primary font-bold">{item.source}</span>
        <span>·</span>
        <span>{formatNewsDate(item.publishedAt)}</span>
        {item.readingMinutes && (
          <>
            <span>·</span>
            <span>{item.readingMinutes} min de lecture</span>
          </>
        )}
      </div>

      {/* Title + byline */}
      <header className="px-6 mb-10">
        <h1 className="text-4xl font-medium leading-[0.95] tracking-tighter mb-4">
          {item.title}
        </h1>
        {item.excerpt && (
          <p className="text-base text-on-surface-variant leading-relaxed border-l-2 border-primary pl-4 italic">
            {item.excerpt}
          </p>
        )}
        {item.author && (
          <p className="mt-4 text-[10px] uppercase tracking-[0.25em] text-outline">
            Par <span className="text-on-background font-bold">{item.author}</span>
          </p>
        )}
      </header>

      {/* Body */}
      <section className="px-6 mb-12">
        <div className="flex flex-col gap-5 max-w-prose">
          {paragraphs.map((p, i) => (
            <p
              key={i}
              className="text-[15px] leading-[1.7] text-on-background"
            >
              {p}
            </p>
          ))}
        </div>
      </section>

      {/* External source (optional) */}
      {item.url && (
        <section className="px-6 mb-12">
          <div className="border border-outline-variant p-4 flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-[9px] uppercase tracking-[0.3em] text-outline mb-1">
                Source externe
              </p>
              <p className="text-xs text-on-surface-variant truncate">
                {safeHostname(item.url)}
              </p>
            </div>
            <Link
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] uppercase tracking-widest font-bold border-b border-primary pb-0.5"
            >
              Lire
              <Icon name="open_in_new" size={12} />
            </Link>
          </div>
        </section>
      )}

      {/* Related */}
      {related.length > 0 && (
        <section className="px-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-primary font-mono text-[11px]">→</span>
            <div className="h-px flex-1 bg-outline-variant" />
            <h2 className="text-[10px] uppercase font-bold tracking-widest">
              À lire ensuite
            </h2>
          </div>
          <ul className="flex flex-col">
            {related.map((r) => (
              <li
                key={r.id}
                className="border-b border-outline-variant/40 last:border-0"
              >
                <Link
                  href={`/actualites/${r.id}`}
                  className="flex items-center gap-3 py-4 group"
                >
                  <div className="w-16 h-16 bg-surface-container-low overflow-hidden flex-shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={r.imageUrl}
                      alt=""
                      className="w-full h-full object-cover grayscale"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] uppercase tracking-widest text-outline mb-1">
                      {formatNewsDate(r.publishedAt)}
                    </p>
                    <h3 className="text-sm font-semibold tracking-tight leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                      {r.title}
                    </h3>
                  </div>
                  <Icon
                    name="arrow_forward"
                    size={16}
                    className="text-outline flex-shrink-0"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
