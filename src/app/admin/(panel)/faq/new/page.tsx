import Link from "next/link";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/session";
import { EMPTY_FAQ, FaqForm } from "@/components/admin/FaqForm";

export const metadata: Metadata = { title: "Новый вопрос" };

export default async function NewFaqPage() {
  await requireAdmin();
  return (
    <>
      <p className="crumbs"><Link href="/admin/faq">← Все вопросы</Link></p>
      <h1 className="page-title">Новый вопрос</h1>
      <FaqForm id={null} initial={EMPTY_FAQ} />
    </>
  );
}
