import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SiteShell } from "@/components/site/SiteShell";
import { Markdown } from "@/components/Markdown";
import { TourCover } from "@/components/site/TourCover";
import { formatDateLong } from "@/lib/domain/moscow-time";
import { getNewsBySlug } from "@/server/news";
import { NAV_BACK } from "@/components/site/transitions";

export const revalidate = 300;
// Страницы строятся по первому запросу и дальше кэшируются (ISR); мутации в админке сбрасывают кэш.
export const generateStaticParams = async () => [];

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const n = await getNewsBySlug((await params).slug);
  if (!n) return { title: "Новость не найдена" };
  const image = n.coverUrl ?? undefined;
  return {
    title: n.title,
    description: n.excerpt || undefined,
    alternates: { canonical: `/news/${n.slug}` },
    openGraph: { type: "article", title: n.title, description: n.excerpt || undefined, publishedTime: n.publishedAt.toISOString(), ...(image ? { images: [image] } : {}) },
  };
}

export default async function NewsArticlePage({ params }: Props) {
  const n = await getNewsBySlug((await params).slug);
  if (!n) notFound();
  return (
    <SiteShell>
      <div className="wrap">
        <article className="article">
          <nav className="crumbs" aria-label="Навигационная цепочка">
            <ol><li><Link href="/" transitionTypes={NAV_BACK}>Главная</Link></li><li><Link href="/news" transitionTypes={NAV_BACK}>Новости</Link></li></ol>
          </nav>
          <header className="article-head">
            <time className="news-date" dateTime={n.publishedAt.toISOString()}>{formatDateLong(n.publishedAt)}</time>
            <h1 className="article-title">{n.title}</h1>
          </header>
          {n.coverUrl && (
            <div className="article-cover">
              <TourCover src={n.coverUrl} alt="" seed={n.slug} sizes="(max-width: 800px) 100vw, 760px" preload />
            </div>
          )}
          <Markdown className="md">{n.body}</Markdown>
          <p className="article-back"><Link href="/news" transitionTypes={NAV_BACK}>← Все новости</Link></p>
        </article>
      </div>
    </SiteShell>
  );
}
