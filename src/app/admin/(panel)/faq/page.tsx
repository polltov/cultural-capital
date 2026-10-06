import Link from "next/link";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/session";
import { listAllFaq } from "@/server/faq";
import { FaqList } from "@/components/admin/FaqList";

export const metadata: Metadata = { title: "Вопросы" };

export default async function FaqAdminPage() {
  await requireAdmin();
  const rows = await listAllFaq();
  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Вопросы</h1>
        <Link href="/admin/faq/new" className="btn btn-accent">
          Добавить вопрос
        </Link>
      </div>
      <p className="muted section-sub">Блок «Часто спрашивают» на главной. Порядок строк — порядок вопросов на сайте. Потяните за ручку, чтобы изменить.</p>
      <FaqList initial={rows.map((r) => ({ id: r.id, question: r.question, published: r.published }))} />
    </>
  );
}
