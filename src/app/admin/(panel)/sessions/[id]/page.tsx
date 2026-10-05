import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/session";
import { getSessionRoster } from "@/server/admin-orders";
import { formatRub } from "@/lib/domain/pricing";
import { formatSessionLong } from "@/lib/domain/moscow-time";
import { PrintButton } from "@/components/admin/PrintButton";

export const metadata: Metadata = { title: "Участники сеанса" };

export default async function SessionRosterPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id: raw } = await params;
  if (!/^\d{1,9}$/.test(raw)) notFound();
  const id = Number(raw);
  const roster = await getSessionRoster(id);
  if (!roster) notFound();
  const { session, rows, totals } = roster;
  const taken = totals.children + totals.adults;

  return (
    <div className="roster">
      <p className="crumbs no-print">
        <Link href="/admin">← Сводка</Link>
      </p>
      <h1 className="page-title">{session.tourTitle}</h1>
      <p className="roster-meta">
        {formatSessionLong(session.startsAt)} · <strong>Занято {taken} из {session.capacity}</strong>
        <span className="muted"> (детей {totals.children}, взрослых {totals.adults})</span>
      </p>

      <div className="btn-row no-print roster-actions">
        <PrintButton />
        <a className="btn btn-accent" href={`/admin/sessions/${id}/csv`} download>
          Скачать CSV
        </a>
      </div>

      {rows.length === 0 ? (
        <p className="muted">Подтверждённых заявок на этот сеанс пока нет.</p>
      ) : (
        <table className="orders-table roster-table">
          <thead>
            <tr>
              <th>Номер</th>
              <th>Имя</th>
              <th>Телефон</th>
              <th className="num">Детей</th>
              <th className="num">Взрослых</th>
              <th className="num">Сумма</th>
              <th>Заметка</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.number}>
                <td>{r.number}</td>
                <td>{r.name}</td>
                <td className="nowrap">{r.phone}</td>
                <td className="num">{r.children}</td>
                <td className="num">{r.adults}</td>
                <td className="num">{formatRub(r.total)}</td>
                <td>{r.adminNote}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
