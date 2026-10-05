import Link from "next/link";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/session";
import { EMPTY_NEWS, NewsForm } from "@/components/admin/NewsForm";

export const metadata: Metadata = { title: "Новая новость" };

export default async function NewNewsPage() {
  await requireAdmin();
  return (
    <>
      <p className="crumbs"><Link href="/admin/news">← Все новости</Link></p>
      <h1 className="page-title">Новая новость</h1>
      <NewsForm id={null} initial={EMPTY_NEWS} published={false} />
    </>
  );
}
