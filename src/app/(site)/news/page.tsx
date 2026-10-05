import Link from "next/link";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Footer } from "@/components/site/StaticSections";
import { NewsCards } from "@/components/site/NewsBlock";
import { listPublishedNews } from "@/server/news";

export const revalidate = 300;
export const metadata: Metadata = { title: "Новости — Культурная Столица" };

export default async function NewsArchivePage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const { page: raw } = await searchParams;
  const requested = typeof raw === "string" && /^\d{1,6}$/.test(raw) ? Number(raw) : 1;
  const { items, page, pages } = await listPublishedNews(requested);
  return (
    <div className="mock">
      <SiteHeader />
      <main>
        <div className="section-h">
          <div className="kicker">Новости</div>
          <h1 className="stitle">Все <em>новости</em></h1>
        </div>
        {items.length === 0 ? <p className="news-empty">Пока новостей нет.</p> : <NewsCards items={items} />}
        {pages > 1 && (
          <nav className="pager" aria-label="Страницы">
            {page > 1 ? <Link href={page === 2 ? "/news" : `/news?page=${page - 1}`} rel="prev">← Новее</Link> : <span />}
            <span className="pager-info">Страница {page} из {pages}</span>
            {page < pages ? <Link href={`/news?page=${page + 1}`} rel="next">Старее →</Link> : <span />}
          </nav>
        )}
      </main>
      <Footer />
    </div>
  );
}
