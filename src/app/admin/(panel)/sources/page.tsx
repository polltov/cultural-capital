import Link from "next/link";
import type { Metadata } from "next";
import { requireAccess } from "@/lib/auth/viewer";
import { getSourceReport, SOURCE_PERIODS } from "@/server/admin-orders";
import { formatRub } from "@/lib/domain/pricing";
import { pluralRu } from "@/lib/domain/seats";

export const metadata: Metadata = { title: "Источники продаж" };

const DEFAULT_DAYS = 30;

export default async function SourcesPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requireAccess("sources");
  const { days: raw } = await searchParams;
  const days = SOURCE_PERIODS.find((d) => String(d) === raw) ?? DEFAULT_DAYS;
  const rows = await getSourceReport(days);
  const total = rows.reduce(
    (a, r) => ({ started: a.started + r.started, paid: a.paid + r.paid, tickets: a.tickets + r.tickets, revenue: a.revenue + r.revenue }),
    { started: 0, paid: 0, tickets: 0, revenue: 0 },
  );

  return (
    <>
      <h1 className="page-title">Источники продаж</h1>
      <p className="muted section-sub">
        Покупки, начатые за последние {days} {pluralRu(days, ["день", "дня", "дней"])}, по тому, откуда человек пришёл на сайт:
        UTM-метки рекламной ссылки или сайт, с которого перешёл (последний заход за 30 дней, не считая прямых). Сумма — по
        оплаченным заказам за вычетом возвратов.
      </p>

      <nav className="btn-row period-switch" aria-label="Период">
        {SOURCE_PERIODS.map((d) => (
          <Link
            key={d}
            href={`/admin/sources?days=${d}`}
            className={`btn ${d === days ? "btn-accent" : "btn-ghost"}`}
            aria-current={d === days ? "page" : undefined}
          >
            {d} {pluralRu(d, ["день", "дня", "дней"])}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="empty">За этот период покупок не было.</p>
      ) : (
        <div className="table-scroll">
          <table className="report-table">
            <thead>
              <tr>
                <th>Источник</th>
                <th>Канал</th>
                <th>Кампания</th>
                <th className="num">Начато</th>
                <th className="num">Оплачено</th>
                <th className="num">Билетов</th>
                <th className="num">Сумма</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.source}|${r.medium}|${r.campaign}`}>
                  <td>{r.source ?? <span className="muted">прямой заход</span>}</td>
                  <td>{r.medium || <span className="muted">—</span>}</td>
                  <td>{r.campaign || <span className="muted">—</span>}</td>
                  <td className="num">{r.started}</td>
                  <td className="num">{r.paid}</td>
                  <td className="num">{r.tickets}</td>
                  <td className="num">{formatRub(r.revenue)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>Всего</td>
                <td className="num">{total.started}</td>
                <td className="num">{total.paid}</td>
                <td className="num">{total.tickets}</td>
                <td className="num">{formatRub(total.revenue)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="muted section-sub">
        Как размечать ссылки в рекламе и постах, чтобы они попадали в отчёт, — в README сайта, раздел «Аналитика».
      </p>
    </>
  );
}
