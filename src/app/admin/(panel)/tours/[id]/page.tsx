import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/session";
import { getAdminTour, listAdminTours } from "@/server/tours";
import { toMoscowLocalInput } from "@/lib/domain/moscow-time";
import { TourForm } from "@/components/admin/TourForm";

export const metadata: Metadata = { title: "Экскурсия" };

export default async function EditTourPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id: raw } = await params;
  if (!/^\d{1,9}$/.test(raw)) notFound();
  const id = Number(raw);
  const data = await getAdminTour(id);
  if (!data) notFound();
  const { tour: t, sessions } = data;
  const position = (await listAdminTours()).findIndex((x) => x.id === id);

  return (
    <>
      <p className="crumbs"><Link href="/admin/tours">← Все экскурсии</Link></p>
      <h1 className="page-title">{t.title}</h1>
      <TourForm
        key={t.updatedAt.getTime()}
        id={t.id}
        number={position + 1}
        initial={{
          title: t.title, subtitle: t.subtitle, route: t.route, description: t.description, note: t.note,
          durationLabel: t.durationLabel, ageLabel: t.ageLabel, priceChild: String(t.priceChild), priceAdult: String(t.priceAdult),
          featured: t.featured, coverUrl: t.coverUrl,
        }}
        initialSessions={sessions.map((s) => ({
          key: `s-${s.id}`, id: s.id, startsAt: toMoscowLocalInput(s.startsAt), capacity: String(s.capacity),
          hidden: s.hidden, taken: s.taken, orders: s.orders,
        }))}
      />
    </>
  );
}
