import Link from "next/link";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/session";
import { listAdminTours } from "@/server/tours";
import { formatDayMonth, formatTime } from "@/lib/domain/moscow-time";
import { TourList } from "@/components/admin/TourList";

export const metadata: Metadata = { title: "Экскурсии" };

export default async function ToursPage() {
  await requireAdmin();
  const rows = await listAdminTours();
  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Экскурсии</h1>
        <Link href="/admin/tours/new" className="btn btn-accent">
          + Новая экскурсия
        </Link>
      </div>
      <p className="muted section-sub">Порядок строк — порядок карточек на сайте. Потяните за ручку, чтобы изменить.</p>
      <TourList
        initial={rows.map((r) => ({
          id: r.id, title: r.title, coverUrl: r.coverUrl, published: r.published,
          next: r.nextSession ? `${formatDayMonth(r.nextSession)}, ${formatTime(r.nextSession)}` : null,
        }))}
      />
    </>
  );
}
