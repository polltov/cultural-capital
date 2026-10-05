import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Footer } from "@/components/site/StaticSections";
import { Markdown } from "@/components/Markdown";
import { formatDateLong } from "@/lib/domain/moscow-time";
import { getNewsBySlug } from "@/server/news";

export const revalidate = 300;
// Страницы строятся по первому запросу и дальше кэшируются (ISR); мутации в админке вызывают revalidatePath.
export const generateStaticParams = async () => [];

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const n = await getNewsBySlug((await params).slug);
  if (!n) return { title: "Новость не найдена" };
  const image = n.coverUrl ?? undefined;
  return {
    title: `${n.title} — Культурная Столица`,
    description: n.excerpt || undefined,
    openGraph: { type: "article", title: n.title, description: n.excerpt || undefined, ...(image ? { images: [image] } : {}) },
  };
}

export default async function NewsArticlePage({ params }: Props) {
  const n = await getNewsBySlug((await params).slug);
  if (!n) notFound();
  return (
    <div className="mock">
      <SiteHeader />
      <main className="article">
        <p className="article-back"><Link href="/news">← Все новости</Link></p>
        <time className="news-date" dateTime={n.publishedAt.toISOString()}>{formatDateLong(n.publishedAt)}</time>
        <h1 className="article-title">{n.title}</h1>
        {n.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- обложка из Blob, как и на карточках
          <img className="article-cover" src={n.coverUrl} alt="" />
        )}
        <Markdown className="md">{n.body}</Markdown>
        <p className="article-back article-back--end"><Link href="/news">← Все новости</Link></p>
      </main>
      <Footer />
    </div>
  );
}
