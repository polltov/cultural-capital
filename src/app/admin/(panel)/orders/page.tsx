import Link from "next/link";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/db/client";
import { tours, tourSessions } from "@/db/schema";
import { asc, desc } from "drizzle-orm";
import { ORDER_STATUSES, STATUS_LABELS, type OrderStatus } from "@/lib/domain/order-status";
import { formatOrderNumber } from "@/lib/domain/order-number";
import { formatRub } from "@/lib/domain/pricing";
import { formatDayMonth, formatTime } from "@/lib/domain/moscow-time";
import { listOrders, ORDERS_PAGE_SIZE, type OrderFilters, type OrderRow } from "@/server/admin-orders";
import { StatusBadge } from "@/components/admin/StatusBadge";

export const metadata: Metadata = { title: "Заявки" };

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const posInt = (v: string | undefined) => (v && /^\d{1,9}$/.test(v) && Number(v) > 0 ? Number(v) : undefined);

function parse(sp: SP) {
  const s = one(sp.status);
  const status: OrderStatus | "all" = s === "all" ? "all" : (ORDER_STATUSES as readonly string[]).includes(s ?? "") ? (s as OrderStatus) : "new";
  const q = (one(sp.q) ?? "").trim().slice(0, 100);
  return { status, tourId: posInt(one(sp.tourId)), sessionId: posInt(one(sp.sessionId)), q, page: posInt(one(sp.page)) ?? 1 };
}

const who = (r: OrderRow) => [r.children ? `дети ${r.children}` : "", r.adults ? `взр. ${r.adults}` : ""].filter(Boolean).join(", ");
const created = (d: Date) => `${formatDayMonth(d)}, ${formatTime(d)}`;

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const f = parse(await searchParams);
  const filters: OrderFilters = f;
  const [{ rows, total }, tourList, sessionList] = await Promise.all([
    listOrders(filters),
    db.select({ id: tours.id, title: tours.title }).from(tours).orderBy(asc(tours.title)),
    db
      .select({ id: tourSessions.id, tourId: tourSessions.tourId, startsAt: tourSessions.startsAt })
      .from(tourSessions)
      .orderBy(desc(tourSessions.startsAt))
      .limit(300),
  ]);
  const pages = Math.max(1, Math.ceil(total / ORDERS_PAGE_SIZE));
  const sessions = f.tourId ? sessionList.filter((s) => s.tourId === f.tourId) : sessionList;

  const href = (page: number) => {
    const p = new URLSearchParams();
    p.set("status", f.status);
    if (f.tourId) p.set("tourId", String(f.tourId));
    if (f.sessionId) p.set("sessionId", String(f.sessionId));
    if (f.q) p.set("q", f.q);
    if (page > 1) p.set("page", String(page));
    return `/admin/orders?${p}`;
  };

  return (
    <>
      <h1 className="page-title">Заявки</h1>

      <form method="get" className="filters" role="search">
        <label className="field">
          <span className="field-label">Статус</span>
          <select name="status" defaultValue={f.status}>
            <option value="all">Все</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Экскурсия</span>
          <select name="tourId" defaultValue={f.tourId ?? ""}>
            <option value="">Все</option>
            {tourList.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Сеанс</span>
          <select name="sessionId" defaultValue={f.sessionId ?? ""}>
            <option value="">Все</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {formatDayMonth(s.startsAt)}, {formatTime(s.startsAt)}
              </option>
            ))}
          </select>
        </label>
        <label className="field field--grow">
          <span className="field-label">Поиск</span>
          <input type="search" name="q" defaultValue={f.q} placeholder="Имя или телефон" />
        </label>
        <button type="submit" className="btn btn-accent">
          Найти
        </button>
      </form>

      {rows.length === 0 ? (
        <p className="empty">{f.status === "new" && !f.q && !f.tourId && !f.sessionId ? "Новых заявок нет." : "Заявок не найдено."}</p>
      ) : (
        <>
          <table className="orders-table">
            <thead>
              <tr>
                <th>№</th>
                <th>Создана</th>
                <th>Экскурсия и сеанс</th>
                <th>Клиент</th>
                <th>Состав</th>
                <th className="num">Сумма</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/admin/orders/${r.id}`} className="order-link">
                      {formatOrderNumber(r.number)}
                    </Link>
                  </td>
                  <td className="muted">{created(r.createdAt)}</td>
                  <td>
                    {r.tourTitle}
                    <span className="muted block">
                      {formatDayMonth(r.startsAt)}, {formatTime(r.startsAt)}
                    </span>
                  </td>
                  <td>
                    {r.customerName}
                    <span className="muted block">{r.phone}</span>
                  </td>
                  <td>{who(r)}</td>
                  <td className="num">{formatRub(r.total)}</td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <ul className="order-cards">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/admin/orders/${r.id}`} className="order-card">
                  <span className="order-card-top">
                    <strong>{formatOrderNumber(r.number)}</strong>
                    <StatusBadge status={r.status} />
                  </span>
                  <span>{r.customerName}</span>
                  <span className="muted">
                    {r.tourTitle}, {formatDayMonth(r.startsAt)} {formatTime(r.startsAt)}
                  </span>
                  <span className="order-card-bottom">
                    <span className="muted">{who(r)}</span>
                    <span>{formatRub(r.total)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {pages > 1 && (
        <nav className="pager" aria-label="Страницы">
          {f.page > 1 ? <Link href={href(f.page - 1)}>← Назад</Link> : <span />}
          <span className="muted">
            {f.page} из {pages}
          </span>
          {f.page < pages ? <Link href={href(f.page + 1)}>Дальше →</Link> : <span />}
        </nav>
      )}
    </>
  );
}
