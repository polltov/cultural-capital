import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/session";
import { getFaqItem } from "@/server/faq";
import { FaqForm } from "@/components/admin/FaqForm";

export const metadata: Metadata = { title: "Вопрос" };

export default async function EditFaqPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id: raw } = await params;
  if (!/^\d{1,9}$/.test(raw)) notFound();
  const item = await getFaqItem(Number(raw));
  if (!item) notFound();
  return (
    <>
      <p className="crumbs"><Link href="/admin/faq">← Все вопросы</Link></p>
      <h1 className="page-title">Изменить вопрос</h1>
      <FaqForm key={item.id} id={item.id} initial={{ question: item.question, answer: item.answer }} />
    </>
  );
}
