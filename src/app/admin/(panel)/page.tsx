import Link from "next/link";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/session";
import { getDashboard } from "@/server/admin-orders";
import { formatDayMonth, formatTime, formatWeekday } from "@/lib/domain/moscow-time";

export const metadata: Metadata = { title: "Сводка" };

export default async function DashboardPage() {
  await requireAdmin();
  const { newOrders, upcoming } = await getDashboard();
  return (
    <>
      <h1 className="page-title">Сводка</h1>

      <Link href="/admin/orders?status=new" className={`stat-card${newOrders > 0 ? " stat-card--hot" : ""}`}>
        <span className="stat-label">Новые заявки</span>
        <span className="stat-value">{newOrders}</span>
        <span className="stat-link">Открыть список →</span>
      </Link>

      <section className="panel-section">
        <h2 className="section-title">Ближайшие сеансы</h2>
        <p className="muted section-sub">На 14 дней вперёд, заполненность по подтверждённым заявкам</p>
        {upcoming.length === 0 ? (
          <p className="empty">В ближайшие две недели сеансов нет.</p>
        ) : (
          <ul className="sessions">
            {upcoming.map((s) => {
              const pct = s.capacity > 0 ? Math.min(100, Math.round((s.taken / s.capacity) * 100)) : 0;
              const full = s.taken >= s.capacity;
              return (
                <li key={s.sessionId}>
                  <Link href={`/admin/sessions/${s.sessionId}`} className="session-row">
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
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
