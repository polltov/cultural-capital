import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/session";
import { formatSessionLong, formatTime, startOfMoscowDay } from "@/lib/domain/moscow-time";
import { STATUS_LABELS } from "@/lib/domain/order-status";
import { formatComposition } from "@/lib/domain/seats";
import { getCheckinOrder, VALID_TICKET_STATUSES } from "@/server/checkin";
import { toggleCheckin } from "../actions";

export const metadata: Metadata = { title: "Отметка прихода" };
export const dynamic = "force-dynamic";

/** Сюда ведёт QR-код билета: гид видит, чей это билет и на какой сеанс, и отмечает приход одной кнопкой. */
export default async function CheckinPage({ params }: { params: Promise<{ token: string }> }) {
  await requireAdmin();
  const { token } = await params;
  const o = await getCheckinOrder(token);
  if (!o) notFound();

  const valid = (VALID_TICKET_STATUSES as readonly string[]).includes(o.status);
  const today = startOfMoscowDay(new Date()).getTime();
  const day = startOfMoscowDay(o.startsAt).getTime();
  const otherDay = day !== today;

  let banner: { ok: boolean; text: string };
  if (!valid) banner = { ok: false, text: `Билет недействителен: заказ «${STATUS_LABELS[o.status].toLowerCase()}»` };
  else if (otherDay) banner = { ok: false, text: day < today ? "Билет на прошедший сеанс — проверьте дату" : "Билет не на сегодня — проверьте дату" };
  else banner = { ok: true, text: o.checkedInAt ? "Приход отмечен" : "Билет действителен" };

  return (
    <div className="checkin">
      <p className="crumbs">
        <Link href={`/admin/sessions/${o.sessionId}`}>← Участники сеанса</Link>
      </p>
      <h1 className="page-title">Билет {o.number}</h1>
      <p className={`banner ${banner.ok ? "banner--ok" : "banner--error"} checkin-banner`} role="status">
        {banner.text}
      </p>

      <dl className="detail">
        <dt>Экскурсия</dt>
        <dd>{o.tourTitle}</dd>
        <dt>Сеанс</dt>
        <dd>{formatSessionLong(o.startsAt)}</dd>
        <dt>Состав</dt>
        <dd>
          <strong>{formatComposition(o.children, o.adults)}</strong>
        </dd>
        <dt>Имя</dt>
        <dd>{o.customerName}</dd>
        <dt>Телефон</dt>
        <dd>
          <a href={`tel:${o.phone}`} className="text-link">
            {o.phone}
          </a>
        </dd>
        {o.comment && (
          <>
            <dt>Комментарий клиента</dt>
            <dd>{o.comment}</dd>
          </>
        )}
        {o.adminNote && (
          <>
            <dt>Заметка</dt>
            <dd>{o.adminNote}</dd>
          </>
        )}
        <dt>Приход</dt>
        <dd>{o.checkedInAt ? `отмечен в ${formatTime(o.checkedInAt)}${o.checkedInAt.getTime() < today ? ` (${formatSessionLong(o.checkedInAt)})` : ""}` : "не отмечен"}</dd>
      </dl>

      {valid && (
        <div className="btn-row">
          {o.checkedInAt ? (
            <form action={toggleCheckin.bind(null, o.id, false)}>
              <button type="submit" className="btn btn-ghost">Снять отметку</button>
            </form>
          ) : (
            <form action={toggleCheckin.bind(null, o.id, true)}>
              <button type="submit" className="btn btn-accent checkin-btn">Отметить приход</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
