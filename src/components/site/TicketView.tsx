import Link from "next/link";
import "./ticket.css";
import { formatDayMonth, formatSessionLong, formatTime, formatWeekday } from "@/lib/domain/moscow-time";
import { formatRub } from "@/lib/domain/pricing";
import { CANCEL_TERMS } from "@/lib/domain/refund-policy";
import { formatComposition } from "@/lib/domain/seats";
import { operator } from "@/lib/legal";
import type { TicketData } from "@/server/mail/templates";
import type { OrderPageData } from "@/server/order-page";
import { AwaitPayment } from "./AwaitPayment";
import { PrintButton } from "./PrintButton";

/** Контакты исполнителя из `legal.ts`; пустые поля пропускаются. */
const contactItems = () => [operator.phone, operator.email].map((s) => s.trim()).filter(Boolean);

function Contacts() {
  const contacts = contactItems();
  return contacts.length > 0 ? <p className="order-contacts">Контакты: {contacts.join(" · ")}</p> : null;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function PaidTicket({ ticket: t }: { ticket: TicketData }) {
  const meetingPoint = t.meetingPoint.trim();
  const bring = t.whatToBring.trim();
  return (
    <>
      <article className="ticket open order-ticket">
        <div className="ticket-photo">
          <span className="t-cat">Билет</span>
          <span className="t-date">
            <b>{formatDayMonth(t.startsAt)}</b>
            {formatWeekday(t.startsAt)} · {formatTime(t.startsAt)}
          </span>
        </div>
        <div className="perf"><span className="t-stub">№ {t.number}</span></div>
        <div className="ticket-info">
          <h1 className="t-title">{t.tourTitle}</h1>
          <dl className="order-rows">
            <Row label="Дата и время">{formatSessionLong(t.startsAt)}</Row>
            {meetingPoint && <Row label="Место встречи">{meetingPoint}</Row>}
            <Row label="Состав">{formatComposition(t.children, t.adults)}</Row>
            <Row label="Имя">{t.name}</Row>
          </dl>
          {bring && (
            <div className="t-note order-bring">
              <b>Что взять с собой</b>
              {bring}
            </div>
          )}
          <div className="t-foot">
            <span className="t-price">{formatRub(t.total)}</span>
            <PrintButton />
          </div>
          <p className="order-receipt">Кассовый чек отправлен на email отдельным письмом от ЮKassa</p>
        </div>
      </article>
      <p className="order-terms">{CANCEL_TERMS}</p>
    </>
  );
}

/** Возврат — формулировка и срок как в письме об отмене (`cancelledEmail`). */
function CancelledState({ ticket: t, refunded }: Pick<OrderPageData, "ticket" | "refunded">) {
  return (
    <div className="order-state">
      <h1 className="order-h1">Заказ отменён</h1>
      {refunded > 0 ? (
        <>
          <p>Заказ {t.number}: возврат {formatRub(refunded)} оформлен.</p>
          <p>Деньги вернутся тем же способом, которым вы платили, в течение нескольких дней — срок зависит от банка.</p>
        </>
      ) : (
        <p>Заказ {t.number} · {t.tourTitle}</p>
      )}
    </div>
  );
}

/** «Не оплачен»: истекло время или платёж отклонён — в обоих случаях места освобождены, можно купить заново. */
function UnpaidState({ title, text }: { title: string; text: string }) {
  return (
    <div className="order-state">
      <h1 className="order-h1">{title}</h1>
      <p>{text}</p>
      <Link className="btn-primary" href="/#catalog">Выбрать дату заново</Link>
    </div>
  );
}

/**
 * Страница заказа по состоянию: билет (оплачен/проведён), ожидание оплаты, «не оплачен» / «оплата не прошла», «отменён».
 * Серверный компонент; клиентские — только опрос (`AwaitPayment`) и печать (`PrintButton`).
 */
export function TicketView({ view, ticket, refunded }: OrderPageData) {
  return (
    <section className="order-view">
      {view === "paid" && <PaidTicket ticket={ticket} />}
      {view === "awaiting" && (
        <>
          <AwaitPayment />
          <p className="order-sub">Заказ {ticket.number} · {ticket.tourTitle}</p>
        </>
      )}
      {view === "expired" && (
        <UnpaidState title="Время на оплату истекло" text={`Заказ ${ticket.number} не оплачен вовремя, места освобождены.`} />
      )}
      {view === "declined" && (
        <UnpaidState title="Оплата не прошла" text={`Платёж по заказу ${ticket.number} не прошёл, места освобождены. Можно выбрать дату и оплатить заново.`} />
      )}
      {view === "cancelled" && <CancelledState ticket={ticket} refunded={refunded} />}
      <Contacts />
    </section>
  );
}
