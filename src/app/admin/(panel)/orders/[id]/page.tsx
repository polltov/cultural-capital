import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/session";
import { getOrder } from "@/server/admin-orders";
import { listMoveTargets } from "@/server/refunds";
import { paymentStatusLabel } from "@/lib/domain/order-status";
import { formatOrderNumber } from "@/lib/domain/order-number";
import { formatRub } from "@/lib/domain/pricing";
import { formatSessionLong, formatDayMonth, formatTime } from "@/lib/domain/moscow-time";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { OrderActions } from "@/components/admin/OrderActions";
import { saveNote } from "../actions";

export const metadata: Metadata = { title: "Заказ" };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id: raw } = await params;
  if (!/^\d{1,9}$/.test(raw)) notFound();
  const o = await getOrder(Number(raw));
  if (!o) notFound();
  // Переносить можно только оплаченный заказ; список сеансов нужен лишь ему.
  const moveTargets = o.status === "paid" ? await listMoveTargets(o.id) : [];
  const online = o.paymentId !== null;

  return (
    <>
      <p className="crumbs">
        <Link href="/admin/orders">← Все заказы</Link>
      </p>
      <h1 className="page-title">
        Заказ {formatOrderNumber(o.number)} <StatusBadge status={o.status} />
      </h1>

      <OrderActions
        id={o.id}
        status={o.status}
        total={o.total}
        startsAt={o.startsAt}
        moveTargets={moveTargets}
        hasTicket={o.accessToken !== null && o.email !== null}
      />

      <dl className="detail">
        <dt>Экскурсия</dt>
        <dd>{o.tourTitle}</dd>
        <dt>Сеанс</dt>
        <dd>
          {formatSessionLong(o.startsAt)} ·{" "}
          <Link href={`/admin/sessions/${o.sessionId}`} className="text-link">
            Участники сеанса
          </Link>
        </dd>
        <dt>Клиент</dt>
        <dd>{o.customerName}</dd>
        <dt>Телефон</dt>
        <dd>
          <a href={`tel:${o.phone}`} className="text-link">
            {o.phone}
          </a>
        </dd>
        <dt>Email</dt>
        <dd>
          {o.email ? (
            <a href={`mailto:${o.email}`} className="text-link">
              {o.email}
            </a>
          ) : (
            <span className="muted">не указан</span>
          )}
        </dd>
        <dt>Комментарий клиента</dt>
        <dd>{o.comment || <span className="muted">нет</span>}</dd>
        <dt>Состав</dt>
        <dd>
          {o.children > 0 && (
            <span className="block">
              Дети: {o.children} × {formatRub(o.priceChildSnapshot)}
            </span>
          )}
          {o.adults > 0 && (
            <span className="block">
              Взрослые: {o.adults} × {formatRub(o.priceAdultSnapshot)}
            </span>
          )}
        </dd>
        <dt>Итого</dt>
        <dd>
          <strong>{formatRub(o.total)}</strong>
        </dd>
        <dt>Создана</dt>
        <dd>
          {formatDayMonth(o.createdAt)}, {formatTime(o.createdAt)} (МСК)
        </dd>
      </dl>

      {online && (
        <section className="panel-section panel-section--tight">
          <h2 className="section-title">Оплата</h2>
          <dl className="detail">
            <dt>ID платежа</dt>
            <dd>{o.paymentId}</dd>
            <dt>Сумма</dt>
            <dd>{formatRub(o.total)}</dd>
            <dt>Статус</dt>
            <dd>
              {o.paidAt ? (
                <>
                  Оплачен {formatDayMonth(o.paidAt)}, {formatTime(o.paidAt)} (МСК)
                </>
              ) : (
                <span className="muted">{paymentStatusLabel(o.paymentStatus)}</span>
              )}
            </dd>
            {o.refundedAmount > 0 && (
              <>
                <dt>Возврат</dt>
                <dd>Возвращено {formatRub(o.refundedAmount)}</dd>
              </>
            )}
            {o.paidAt && (
              <>
                <dt>Билет</dt>
                <dd>
                  {o.ticketSentAt ? (
                    <>
                      Билет отправлен {formatDayMonth(o.ticketSentAt)}, {formatTime(o.ticketSentAt)} (МСК)
                    </>
                  ) : (
                    "Билет не отправлен"
                  )}
                </dd>
              </>
            )}
            {o.accessToken && (
              <>
                <dt>Страница клиента</dt>
                <dd>
                  <a href={`/order/${o.accessToken}`} target="_blank" rel="noopener" className="text-link">
                    Открыть страницу клиента
                  </a>
                </dd>
              </>
            )}
          </dl>
        </section>
      )}

      <form action={saveNote.bind(null, o.id)} className="note-form">
        <label className="field">
          <span className="field-label">Заметка администратора</span>
          <textarea name="note" rows={4} maxLength={2000} defaultValue={o.adminNote} />
        </label>
        <button type="submit" className="btn btn-accent">
          Сохранить заметку
        </button>
      </form>
    </>
  );
}
