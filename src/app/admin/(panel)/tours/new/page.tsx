import Link from "next/link";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/session";
import { listAdminTours } from "@/server/tours";
import { EMPTY_TOUR, TourForm } from "@/components/admin/TourForm";

export const metadata: Metadata = { title: "Новая экскурсия" };

export default async function NewTourPage() {
  await requireAdmin();
  const count = (await listAdminTours()).length;
  return (
    <>
      <p className="crumbs"><Link href="/admin/tours">← Все экскурсии</Link></p>
      <h1 className="page-title">Новая экскурсия</h1>
      <TourForm id={null} initial={EMPTY_TOUR} initialSessions={[]} number={count + 1} />
    </>
  );
}
