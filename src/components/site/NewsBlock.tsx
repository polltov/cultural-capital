import Link from "next/link";
import { formatDateLong } from "@/lib/domain/moscow-time";
import type { NewsCard } from "@/server/news";
import { SectionHead } from "./SectionHead";
import { TourCover } from "./TourCover";

/** Раскладка по числу новостей: одна — широкая карточка (обложка слева, текст справа), две — пополам, дальше — по три в ряд. */
const LAYOUTS = {
  1: { className: "news-grid news-grid--1", sizes: "(max-width: 759px) 100vw, 580px" },
  2: { className: "news-grid news-grid--2", sizes: "(max-width: 639px) 100vw, (max-width: 1280px) 50vw, 600px" },
  many: { className: "news-grid", sizes: "(max-width: 639px) 100vw, (max-width: 1099px) 50vw, 384px" },
} as const;

/**
 * Карточки новостей; `level` — уровень заголовка карточки: h3 внутри секции главной, h2 на странице «Новости».
 * Одна или две новости занимают всю ширину: иначе справа от карточки оставалось две трети пустого ряда.
 */
export function NewsCards({ items, level = 3 }: { items: NewsCard[]; level?: 2 | 3 }) {
  const H = level === 2 ? "h2" : "h3";
  const layout = items.length === 1 ? LAYOUTS[1] : items.length === 2 ? LAYOUTS[2] : LAYOUTS.many;
  return (
    <div className={layout.className}>
      {items.map((n) => (
        <article key={n.id} className="news-card">
          <div className="news-cover">
            <TourCover src={n.coverUrl} alt="" seed={n.slug} sizes={layout.sizes} />
          </div>
          <div className="news-body">
            <time className="news-date" dateTime={n.publishedAt.toISOString()}>{formatDateLong(n.publishedAt)}</time>
            <H className="news-title"><Link href={`/news/${n.slug}`}>{n.title}</Link></H>
            {n.excerpt && <p className="news-excerpt">{n.excerpt}</p>}
            {/* в широкой карточке есть место для явного «Читать»; ссылкой остаётся заголовок, она растянута на всю карточку */}
            {items.length === 1 && <span className="news-more" aria-hidden="true">Читать <span>→</span></span>}
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
