import { and, eq, inArray, sql } from "drizzle-orm";
import { db as sharedDb, type Db } from "@/db/client";
import { orders, tours, tourSessions } from "@/db/schema";
import { ORDER_TOKEN } from "@/lib/checkin";
import type { OrderStatus } from "@/lib/domain/order-status";
import { formatOrderNumber } from "@/lib/domain/order-number";

/** По билету можно пройти: заказ оплачен (или уже проведён после экскурсии). */
export const VALID_TICKET_STATUSES = ["paid", "done"] as const satisfies readonly OrderStatus[];

export type CheckinOrder = {
  id: number;
  number: string;
  status: OrderStatus;
  customerName: string;
  phone: string;
  comment: string;
  adminNote: string;
  children: number;
  adults: number;
  checkedInAt: Date | null;
  sessionId: number;
  startsAt: Date;
  tourTitle: string;
};

/** Заказ по токену из QR-кода; `null` — токен не того формата или такого заказа нет. */
export async function getCheckinOrder(token: string, db: Db = sharedDb): Promise<CheckinOrder | null> {
  if (!ORDER_TOKEN.test(token)) return null;
  const [r] = await db
    .select({
      id: orders.id, number: orders.number, status: orders.status, customerName: orders.customerName, phone: orders.phone,
      comment: orders.comment, adminNote: orders.adminNote, children: orders.children, adults: orders.adults,
      checkedInAt: orders.checkedInAt, sessionId: orders.sessionId, startsAt: tourSessions.startsAt, tourTitle: tours.title,
    })
    .from(orders)
    .innerJoin(tourSessions, eq(orders.sessionId, tourSessions.id))
    .innerJoin(tours, eq(tourSessions.tourId, tours.id))
    .where(eq(orders.accessToken, token));
  return r ? { ...r, number: formatOrderNumber(r.number) } : null;
}

export type CheckinResult = { ok: true; checkedInAt: Date | null } | { ok: false; error: string };

/**
 * Отметить приход (или снять отметку). Только для действующего билета. Повторная отметка не сдвигает время первой:
 * гид мог отсканировать один билет дважды.
 */
export async function setCheckedIn(orderId: number, on: boolean, db: Db = sharedDb): Promise<CheckinResult> {
  const [r] = await db
    .update(orders)
    .set({ checkedInAt: on ? sql`coalesce(${orders.checkedInAt}, now())` : null })
    .where(and(eq(orders.id, orderId), inArray(orders.status, [...VALID_TICKET_STATUSES])))
    .returning({ checkedInAt: orders.checkedInAt });
  if (!r) return { ok: false, error: "Отметить можно только оплаченный заказ" };
  return { ok: true, checkedInAt: r.checkedInAt };
}
