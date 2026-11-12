import Link from "next/link";
import type { Metadata } from "next";
import { SiteShell } from "@/components/site/SiteShell";
import { NewsCards } from "@/components/site/NewsBlock";
import { listPublishedNews } from "@/server/news";

export const revalidate = 300;
export const metadata: Metadata = {
  title: "Новости",
  description: "Новости экскурсионного проекта «Культурная Столица»: новые маршруты, даты и события.",
  alternates: { canonical: "/news" },
};

export default async function NewsArchivePage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const { page: raw } = await searchParams;
  const requested = typeof raw === "string" && /^\d{1,6}$/.test(raw) ? Number(raw) : 1;
  const { items, page, pages } = await listPublishedNews(requested);
  return (
    <SiteShell mainClassName="news-page">
      <div className="wrap">
        <nav className="crumbs" aria-label="Навигационная цепочка">
          <ol><li><Link href="/">Главная</Link></li><li aria-current="page">Новости</li></ol>
        </nav>
        <header className="page-head">
          <p className="kicker">Новости</p>
          <h1 className="page-title">Все <em>новости</em></h1>
        </header>
        {items.length === 0 ? <p className="empty">Пока новостей нет.</p> : <NewsCards items={items} level={2} />}
        {pages > 1 && (
          <nav className="pager" aria-label="Страницы">
            {page > 1 ? <Link href={page === 2 ? "/news" : `/news?page=${page - 1}`} rel="prev">← Новее</Link> : <span />}
            <span className="pager-info">Страница {page} из {pages}</span>
            {page < pages ? <Link href={`/news?page=${page + 1}`} rel="next">Старее →</Link> : <span />}
          </nav>
        )}
      </div>
    </SiteShell>
  );
}
