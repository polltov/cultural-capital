import { and, eq, isNotNull } from "drizzle-orm";
import { db as sharedDb, type Db } from "@/db/client";
import { orders, tours, tourSessions } from "@/db/schema";
import { formatOrderNumber } from "@/lib/domain/order-number";
import { sendMail } from "./mail/send";
import { cancelledEmail, sorryEmail, ticketEmail, type TicketData } from "./mail/templates";

type Loaded = { ticket: TicketData; refunded: number };

async function load(orderId: number, db: Db): Promise<Loaded | null> {
  const [row] = await db
    .select({ o: orders, title: tours.title, meetingPoint: tours.meetingPoint, whatToBring: tours.whatToBring, startsAt: tourSessions.startsAt })
    .from(orders)
    .innerJoin(tourSessions, eq(orders.sessionId, tourSessions.id))
    .innerJoin(tours, eq(tourSessions.tourId, tours.id))
    .where(and(eq(orders.id, orderId), isNotNull(orders.accessToken), isNotNull(orders.email)));
  // Старые заявки без email/токена билета не получают.
  if (!row || !row.o.accessToken || !row.o.email) return null;
  const site = process.env.SITE_URL || "http://localhost:3000";
  return {
    refunded: row.o.refundedAmount,
    ticket: {
      orderId: row.o.id, number: formatOrderNumber(row.o.number), tourTitle: row.title, startsAt: row.startsAt,
      meetingPoint: row.meetingPoint, whatToBring: row.whatToBring, children: row.o.children, adults: row.o.adults,
      total: row.o.total, name: row.o.customerName, email: row.o.email, url: `${site}/order/${row.o.accessToken}`,
    },
  };
}

/** Данные билета; `null` — заказа нет либо у него нет токена страницы или email (старая заявка). */
export async function loadTicket(orderId: number, db: Db = sharedDb): Promise<TicketData | null> {
  return (await load(orderId, db))?.ticket ?? null;
}

/**
 * Общий путь отправки: загрузка данных → письмо → `onSent`. Вызывается из `after()`, поэтому не бросает:
 * ошибки БД и почты логируются, результат — `false`.
 */
async function deliver(
  what: string,
  orderId: number,
  db: Db,
  compose: (l: Loaded) => { subject: string; html: string; text: string },
  onSent?: () => Promise<unknown>,
): Promise<boolean> {
  try {
    const l = await load(orderId, db);
    if (!l) return false;
    const ok = await sendMail({ to: l.ticket.email, ...compose(l) });
    if (ok) await onSent?.();
    return ok;
  } catch (e) {
    console.error(`Письмо «${what}»: ошибка для заказа ${orderId}`, e);
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

/** Письмо об отмене; сумма возврата берётся из заказа (`refunded_amount`). */
export function sendCancelled(orderId: number, db: Db = sharedDb): Promise<boolean> {
  return deliver("отмена", orderId, db, (l) => cancelledEmail(l.ticket, l.refunded));
}

/** Письмо-извинение: поздняя оплата, а мест уже нет. */
export function sendSorry(orderId: number, db: Db = sharedDb): Promise<boolean> {
  return deliver("извинение", orderId, db, (l) => sorryEmail(l.ticket));
}
