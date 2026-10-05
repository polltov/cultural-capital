import Link from "next/link";
import { formatDateLong } from "@/lib/domain/moscow-time";
import type { NewsCard } from "@/server/news";

export function NewsCards({ items }: { items: NewsCard[] }) {
  return (
    <div className="news-grid">
      {items.map((n) => (
        <Link key={n.id} href={`/news/${n.slug}`} className="news-card">
          <div className="news-cover" style={n.coverUrl ? { backgroundImage: `url("${n.coverUrl}")` } : undefined} aria-hidden="true" />
          <div className="news-body">
            <time className="news-date" dateTime={n.publishedAt.toISOString()}>{formatDateLong(n.publishedAt)}</time>
            <h3 className="news-title">{n.title}</h3>
            {n.excerpt && <p className="news-excerpt">{n.excerpt}</p>}
          </div>
        </Link>
      ))}
    </div>
  );
}

/** Блок «Новости» на главной: до 3 карточек; без опубликованных новостей не рендерится. */
export function NewsBlock({ items }: { items: NewsCard[] }) {
  if (items.length === 0) return null;
  return (
    <>
      <div className="section-h" id="news">
        <div className="kicker">Новости</div>
        <div className="stitle">Что <em>нового</em></div>
      </div>
      <NewsCards items={items} />
      <div className="news-more">
        <Link href="/news" className="btn-ghost">Все новости →</Link>
      </div>
    </>
  );
}
