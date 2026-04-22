"use client";

import Link from "next/link";
import { Icon } from "@/components/Icon";
import { formatNewsDate, type NewsItem } from "@/lib/news";

export function NewsRail({ items }: { items: NewsItem[] }) {
  if (items.length === 0) return null;

  return (
    <div className="flex gap-4 overflow-x-auto hide-scrollbar -mx-6 px-6 pb-2">
      {items.map((n) => (
        <NewsCard key={n.id} item={n} />
      ))}
    </div>
  );
}

function NewsCard({ item }: { item: NewsItem }) {
  const Body = (
    <article className="min-w-[280px] max-w-[280px] flex-shrink-0 group">
      <div className="relative aspect-[16/10] bg-surface-container-low overflow-hidden">
        <img
          src={item.imageUrl}
          alt=""
          className="w-full h-full object-cover grayscale contrast-110 group-hover:grayscale-0 transition-all duration-700"
        />
        <div className="absolute top-2 left-2 flex flex-wrap gap-1">
          {item.tags.slice(0, 2).map((t) => (
            <span
              key={t}
              className="text-[9px] uppercase tracking-widest font-mono bg-background/90 px-2 py-0.5 border border-outline-variant"
            >
              {t}
            </span>
          ))}
        </div>
        {item.url && (
          <div className="absolute bottom-2 right-2 bg-background/90 w-7 h-7 rounded-full flex items-center justify-center">
            <Icon name="arrow_outward" size={14} />
          </div>
        )}
      </div>
      <div className="mt-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-primary">
            {item.source}
          </span>
          <span className="text-[10px] text-outline">·</span>
          <span className="text-[10px] uppercase tracking-widest text-outline font-mono">
            {formatNewsDate(item.publishedAt)}
          </span>
        </div>
        <h3 className="text-base font-semibold tracking-tight leading-snug line-clamp-2 mb-1">
          {item.title}
        </h3>
        <p className="text-xs text-on-surface-variant line-clamp-2">
          {item.excerpt}
        </p>
      </div>
    </article>
  );

  if (item.url) {
    return (
      <Link
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
      >
        {Body}
      </Link>
    );
  }
  return Body;
}
