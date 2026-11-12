import Link from "next/link";
import { formatDateLong } from "@/lib/domain/moscow-time";
import type { NewsCard } from "@/server/news";
import { SectionHead } from "./SectionHead";
import { TourCover } from "./TourCover";

/** Карточки новостей; `level` — уровень заголовка карточки: h3 внутри секции главной, h2 на странице «Новости». */
export function NewsCards({ items, level = 3 }: { items: NewsCard[]; level?: 2 | 3 }) {
  const H = level === 2 ? "h2" : "h3";
  return (
    <div className="news-grid">
      {items.map((n) => (
        <article key={n.id} className="news-card">
          <div className="news-cover">
            <TourCover src={n.coverUrl} alt="" seed={n.slug} sizes="(max-width: 760px) 100vw, (max-width: 1100px) 50vw, 384px" />
          </div>
          <div className="news-body">
            <time className="news-date" dateTime={n.publishedAt.toISOString()}>{formatDateLong(n.publishedAt)}</time>
            <H className="news-title"><Link href={`/news/${n.slug}`}>{n.title}</Link></H>
            {n.excerpt && <p className="news-excerpt">{n.excerpt}</p>}
          </div>
        </article>
      ))}
    </div>
  );
}

/** Блок «Новости» на главной: до 3 карточек; без опубликованных новостей не рендерится. */
export function NewsBlock({ items }: { items: NewsCard[] }) {
  if (items.length === 0) return null;
  return (
    <section className="news-sec" id="news" aria-labelledby="news-title">
      <div className="wrap">
        <SectionHead
          kicker="Новости"
          id="news-title"
          title={<>Что <em>нового</em></>}
          align="start"
          action={<Link href="/news" className="link-more">Все новости <span aria-hidden="true">→</span></Link>}
        />
        <NewsCards items={items} />
      </div>
    </section>
  );
}
