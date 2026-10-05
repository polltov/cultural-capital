import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/session";
import { getAdminNews } from "@/server/news";
import { NewsForm } from "@/components/admin/NewsForm";

export const metadata: Metadata = { title: "Новость" };

export default async function EditNewsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id: raw } = await params;
  if (!/^\d{1,9}$/.test(raw)) notFound();
  const n = await getAdminNews(Number(raw));
  if (!n) notFound();
  return (
    <>
      <p className="crumbs"><Link href="/admin/news">← Все новости</Link></p>
      <h1 className="page-title">{n.title}</h1>
      <NewsForm
        key={n.updatedAt.getTime()}
        id={n.id}
        published={n.publishedAt !== null}
        initial={{ title: n.title, slug: n.slug, excerpt: n.excerpt, body: n.body, coverUrl: n.coverUrl }}
      />
    </>
  );
}
