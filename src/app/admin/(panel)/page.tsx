import Link from "next/link";
import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth/viewer";
import { can } from "@/lib/auth/roles";
import { getDashboard } from "@/server/admin-orders";
import { formatDayMonth, formatTime, formatWeekday } from "@/lib/domain/moscow-time";
import { formatRub } from "@/lib/domain/pricing";
import { pluralRu } from "@/lib/domain/seats";

export const metadata: Metadata = { title: "Сводка" };

export default async function DashboardPage() {
  const viewer = await requireStaff();
  const { paid7d, upcoming } = await getDashboard();
  // Сеансы с заполненностью видят все; выручка — с доступом к заказам, ссылки на участников — с доступом к спискам.
  const orders = can(viewer.role, "orders");
  const sources = can(viewer.role, "sources");
  const roster = can(viewer.role, "roster");
  return (
    <>
      <h1 className="page-title">Сводка</h1>

      {orders && (
        <Link href="/admin/orders?status=paid" className="stat-card stat-card--paid">
          <span className="stat-label">Оплачено за 7 дней</span>
          <span className="stat-value">
            {paid7d.count} {pluralRu(paid7d.count, ["заказ", "заказа", "заказов"])} · {formatRub(paid7d.sum)}
          </span>
          <span className="stat-link">Открыть список →</span>
        </Link>
      )}
      {sources && (
        <p className="muted dash-sources">
          Откуда приходят покупатели —{" "}
          <Link href="/admin/sources" className="text-link">
            источники продаж
          </Link>
        </p>
      )}

      <section className="panel-section">
        <h2 className="section-title">Ближайшие сеансы</h2>
        <p className="muted section-sub">На 14 дней вперёд, заполненность по оплаченным заказам и подтверждённым заявкам</p>
        {upcoming.length === 0 ? (
          <p className="empty">В ближайшие две недели сеансов нет.</p>
        ) : (
          <ul className="sessions">
            {upcoming.map((s) => {
              const pct = s.capacity > 0 ? Math.min(100, Math.round((s.taken / s.capacity) * 100)) : 0;
              const full = s.taken >= s.capacity;
              const body = (
                <>
                    <span className="session-when">
                      <span className="session-date">
                        {formatDayMonth(s.startsAt)}, {formatWeekday(s.startsAt)}
                      </span>
                      <span className="session-time">{formatTime(s.startsAt)}</span>
                    </span>
                    <span className="session-title">{s.tourTitle}</span>
                    <span className="session-fill">
                      <span className="fill-text">
                        {s.taken} из {s.capacity}
                      </span>
                      <span
                        className={`fill-bar${full ? " fill-bar--full" : ""}`}
                        role="meter"
                        aria-valuemin={0}
                        aria-valuemax={s.capacity}
                        aria-valuenow={s.taken}
                        aria-label={`Занято ${s.taken} из ${s.capacity}`}
                      >
                        <span style={{ width: `${pct}%` }} />
                      </span>
                    </span>
                </>
              );
              return (
                <li key={s.sessionId}>
                  {roster ? (
                    <Link href={`/admin/sessions/${s.sessionId}`} className="session-row">
                      {body}
                    </Link>
                  ) : (
                    <div className="session-row">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
