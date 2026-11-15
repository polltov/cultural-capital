import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db as sharedDb, type Db } from "@/db/client";
import { orderRefunds, orders, tours, tourSessions } from "@/db/schema";
import { formatOrderNumber } from "@/lib/domain/order-number";
import { ticketQrImageUrl } from "@/lib/checkin";
import { siteUrl } from "@/lib/site-url";
import { sendMail } from "./mail/send";
import { abandonedEmail, cancelledEmail, reminderEmail, sorryEmail, ticketEmail, ticketsCancelledEmail, type TicketData } from "./mail/templates";

type Loaded = { ticket: TicketData; refunded: number; slug: string };

async function load(orderId: number, db: Db): Promise<Loaded | null> {
  const [row] = await db
    .select({ o: orders, title: tours.title, slug: tours.slug, meetingPoint: tours.meetingPoint, whatToBring: tours.whatToBring, startsAt: tourSessions.startsAt })
    .from(orders)
    .innerJoin(tourSessions, eq(orders.sessionId, tourSessions.id))
    .innerJoin(tours, eq(tourSessions.tourId, tours.id))
    .where(and(eq(orders.id, orderId), isNotNull(orders.accessToken), isNotNull(orders.email)));
  // Старые заявки без email/токена билета не получают.
  if (!row || !row.o.accessToken || !row.o.email) return null;
  return {
    refunded: row.o.refundedAmount,
    slug: row.slug,
    ticket: {
      orderId: row.o.id, number: formatOrderNumber(row.o.number), tourTitle: row.title, startsAt: row.startsAt,
      meetingPoint: row.meetingPoint, whatToBring: row.whatToBring, children: row.o.children, adults: row.o.adults,
      total: row.o.total, name: row.o.customerName, email: row.o.email, url: `${siteUrl()}/order/${row.o.accessToken}`,
      qrImageUrl: ticketQrImageUrl(row.o.accessToken),
    },
  };
}

/** Данные билета; `null` — заказа нет либо у него нет токена страницы или email (старая заявка). */
export async function loadTicket(orderId: number, db: Db = sharedDb): Promise<TicketData | null> {
  return (await load(orderId, db))?.ticket ?? null;
}

/**
 * Общий путь отправки: загрузка данных → письмо → `onSent`. Вызывается из `after()`, поэтому не бросает:
 * ошибки БД и почты логируются, результат — `false`. В лог — только текст ошибки: объект ошибки может нести ссылку
 * на страницу заказа (например, `input` у TypeError из `new URL`), а в ней токен.
 */
async function deliver(
  what: string,
  orderId: number,
  db: Db,
  compose: (l: Loaded) => { subject: string; html: string; text: string } | Promise<{ subject: string; html: string; text: string }>,
  onSent?: () => Promise<unknown>,
): Promise<boolean> {
  try {
    const l = await load(orderId, db);
    if (!l) return false;
    const ok = await sendMail({ to: l.ticket.email, ...(await compose(l)) });
    if (ok) await onSent?.();
    return ok;
  } catch (e) {
    console.error(`Письмо «${what}»: ошибка для заказа ${orderId}:`, e instanceof Error ? e.message : String(e));
    return false;
  }
}

/** Письмо с билетом (оплата / перенос). При успехе ставит `ticket_sent_at`. */
export function sendTicket(orderId: number, kind: "paid" | "moved", db: Db = sharedDb): Promise<boolean> {
  return deliver(
    kind === "paid" ? "билет" : "билет перенесён", orderId, db,
    (l) => ticketEmail(l.ticket, kind),
    () => db.update(orders).set({ ticketSentAt: new Date() }).where(eq(orders.id, orderId)),
  );
}

/**
 * Письмо об отмене. Сумма — последнего возврата по заказу (той отмены, что закрыла заказ): о прежних частичных возвратах
 * клиенту уже писали. Заказы без истории возвратов (до её появления) — вся `refunded_amount`.
 */
export function sendCancelled(orderId: number, db: Db = sharedDb): Promise<boolean> {
  return deliver("отмена", orderId, db, async (l) => {
    const [last] = await db
      .select({ amount: orderRefunds.amount })
      .from(orderRefunds)
      .where(eq(orderRefunds.orderId, orderId))
      .orderBy(desc(orderRefunds.createdAt), desc(orderRefunds.id))
      .limit(1);
    return cancelledEmail(l.ticket, last ? last.amount : l.refunded);
  });
}

/** Письмо-извинение: поздняя оплата, а мест уже нет. */
export function sendSorry(orderId: number, db: Db = sharedDb): Promise<boolean> {
  return deliver("извинение", orderId, db, (l) => sorryEmail(l.ticket));
}

/** Напоминание накануне экскурсии. Отметку `reminder_sent_at` ставит вызывающий (до отправки, см. `runDaily`). */
export function sendReminder(orderId: number, db: Db = sharedDb): Promise<boolean> {
  return deliver("напоминание", orderId, db, (l) => reminderEmail(l.ticket));
}

/** «Вы не завершили оплату» со ссылкой на покупку на странице экскурсии. */
export function sendAbandoned(orderId: number, db: Db = sharedDb): Promise<boolean> {
  return deliver("незавершённая оплата", orderId, db, (l) => abandonedEmail(l.ticket, `${siteUrl()}/tours/${l.slug}#booking`));
}

/** Письмо о частичной отмене: отменённые билеты и сумма возврата этой операции; состав в письме — оставшиеся билеты. */
export function sendTicketsCancelled(orderId: number, cancelled: { children: number; adults: number }, refunded: number, db: Db = sharedDb): Promise<boolean> {
  return deliver("часть билетов отменена", orderId, db, (l) => ticketsCancelledEmail(l.ticket, cancelled, refunded));
}
