import { and, asc, eq, gt, ne, sql } from "drizzle-orm";
import { db as sharedDb, type Db, type Tx } from "@/db/client";
import { orderRefunds, orders, tours, tourSessions } from "@/db/schema";
import type { OrderStatus } from "@/lib/domain/order-status";
import { formatRub } from "@/lib/domain/pricing";
import { formatComposition } from "@/lib/domain/seats";
import { occupiedSeats } from "@/server/orders";
import { paymentGateway } from "@/server/payments/gateway";
import { createReceiptRefund } from "@/server/payments/refund";
import type { GatewayPayment, GatewayRefund, PaymentGateway } from "@/server/payments/types";
import { seatsTakenSql } from "@/server/seats-sql";

export type ActionResult = { ok: true } | { ok: false; error: string };

const NOT_FOUND = "Заказ не найден";

type RefundableOrder = { id: number; status: OrderStatus; refundedAmount: number; children: number; adults: number };

/** Запись в историю возвратов заказа (в транзакции вызывающего). */
export async function logRefund(
  tx: Tx,
  r: { orderId: number; amount: number; children: number; adults: number; source: "admin" | "late" | "external"; refundId?: string | null },
): Promise<void> {
  await tx.insert(orderRefunds).values({ ...r, refundId: r.refundId ?? null });
}

/** Сколько возвратов по заказу уже записано — для ключа идемпотентности следующего. */
async function refundCount(tx: Tx, orderId: number): Promise<number> {
  const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(orderRefunds).where(eq(orderRefunds.orderId, orderId));
  return r.n;
}

/**
 * Возврат, который прошёл мимо сайта (оформлен в кабинете ЮKassa или наш вызов отвалился по таймауту, а ЮKassa его провела):
 * ЮKassa (`payment` — свежий объект из API) знает о возвращённых деньгах больше, чем записано в заказе. Тогда оплаченный заказ
 * отменяется целиком с фактически возвращённой суммой — места освобождаются, билет больше не действует: какие билеты
 * вернули в кабинете, сайту не узнать. Возвраты самого сайта (в том числе частичные) уже учтены в `refunded_amount` и
 * отменой не считаются. Возвращает `true`, если заказ отменён. Вызывающий держит блокировку строки заказа и сам решает,
 * что сказать клиенту и владельцу.
 */
export async function reconcileExternalRefund(tx: Tx, order: RefundableOrder, payment: GatewayPayment): Promise<boolean> {
  const refunded = Math.round(Number(payment.refundedAmount));
  if (order.status !== "paid" || !(refunded > order.refundedAmount)) return false;
  await tx
    .update(orders)
    .set({ status: "cancelled", refundedAmount: refunded, updatedAt: new Date() })
    .where(eq(orders.id, order.id));
  await logRefund(tx, { orderId: order.id, amount: refunded - order.refundedAmount, children: order.children, adults: order.adults, source: "external" });
  return true;
}

/** Ключ идемпотентности возврата: первый — `refund-<id>` (как до частичных возвратов), следующие — с номером. */
const refundKey = (orderId: number, prior: number) => (prior === 0 ? `refund-${orderId}` : `refund-${orderId}-${prior + 1}`);

/**
 * «Отменить и вернуть»: оплаченный заказ → `cancelled`, деньги возвращаются через ЮKassa (`amount` — целые рубли, от 0 до того,
 * что ещё не возвращено: `total − refunded_amount`; после частичных отмен это меньше суммы заказа).
 * Если по платежу уже есть возврат (`reconcileExternalRefund`), нового не будет: заказ закрывается с суммой, которую назвала ЮKassa.
 * `0` — отмена без возврата, шлюз не вызывается. Заказ блокируется на всё время вызова шлюза: второй клик админа дождётся
 * и увидит `cancelled`; вторая страховка от двойного возврата — ключ идемпотентности `refund-<id>`.
 * Любой сбой возврата (сеть, отказ ЮKassa, неверная ставка НДС, ключи не заданы) — заказ не меняется.
 * Письмо клиенту отправляет вызывающий (серверное действие) после успеха.
 */
export async function refundOrder(
  orderId: number,
  amount: number,
  deps: { db?: Db; gateway?: PaymentGateway } = {},
): Promise<ActionResult> {
  const db = deps.db ?? sharedDb;
  return db.transaction(async (tx): Promise<ActionResult> => {
    // `of`: блокируется только строка заказа, а не сеанса и экскурсии.
    const [row] = await tx
      .select({ o: orders, startsAt: tourSessions.startsAt, tourTitle: tours.title })
      .from(orders)
      .innerJoin(tourSessions, eq(orders.sessionId, tourSessions.id))
      .innerJoin(tours, eq(tourSessions.tourId, tours.id))
      .where(eq(orders.id, orderId))
      .for("update", { of: orders });
    if (!row) return { ok: false, error: NOT_FOUND };
    const { o } = row;

    if (o.status !== "paid" || o.paymentId === null) {
      return { ok: false, error: "Вернуть деньги можно только по оплаченному заказу" };
    }
    const left = o.total - o.refundedAmount;
    if (!Number.isInteger(amount) || amount < 0 || amount > left) {
      return { ok: false, error: `Сумма возврата — от 0 до ${formatRub(left)}` };
    }
    const prior = await refundCount(tx, o.id);

    let refund: GatewayRefund | null = null;
    if (amount > 0) {
      try {
        // Шлюз, чек (email, ставка НДС) и сам вызов — внутри try: ненастроенная ЮKassa или неверная ставка — такой же отказ, как ошибка API.
        const gateway = deps.gateway ?? paymentGateway();
        // Деньги могли уже вернуть мимо сайта (в кабинете ЮKassa; наш прошлый вызов отвалился по таймауту, а возврат прошёл):
        // второй возврат не создаём, заказ закрывается с фактически возвращённой суммой — её же назовёт письмо клиенту.
        if (await reconcileExternalRefund(tx, o, await gateway.getPayment(o.paymentId))) return { ok: true };
        refund = await createReceiptRefund(gateway, {
          idempotenceKey: refundKey(o.id, prior),
          paymentId: o.paymentId,
          amount,
          email: o.email,
          tourTitle: row.tourTitle,
          startsAt: row.startsAt,
        });
      } catch (e) {
        console.error(`Возврат: заказ ${o.id} не возвращён`, e);
        return { ok: false, error: `Возврат не прошёл: ${e instanceof Error ? e.message : String(e)}` };
      }
    }

    await tx
      .update(orders)
      .set({ status: "cancelled", refundedAmount: o.refundedAmount + amount, ...(refund ? { refundId: refund.id } : {}), updatedAt: new Date() })
      .where(eq(orders.id, o.id));
    await logRefund(tx, { orderId: o.id, amount, children: o.children, adults: o.adults, source: "admin", refundId: refund?.id });
    return { ok: true };
  });
}

/** Стоимость билетов по слепку цен заказа. */
export const ticketsValue = (o: { priceChildSnapshot: number; priceAdultSnapshot: number }, children: number, adults: number) =>
  children * o.priceChildSnapshot + adults * o.priceAdultSnapshot;

/**
 * «Отменить часть билетов»: из оплаченного заказа убираются `children` детских и `adults` взрослых билетов (хотя бы один
 * билет должен остаться — иначе это «Отменить и вернуть»), за них возвращается `amount` (0…стоимость отменённых билетов,
 * но не больше ещё не возвращённого). Места освобождаются сразу: заказ занимает столько мест, сколько в нём билетов.
 * Сумма заказа (`total`) не меняется — это сумма платежа; возвращённое копится в `refunded_amount`, каждая отмена пишется в
 * историю (`order_refunds`). Блокировки, сверка с ЮKassa и ошибки — как у `refundOrder`.
 */
export async function cancelTickets(
  orderId: number,
  tickets: { children: number; adults: number },
  amount: number,
  deps: { db?: Db; gateway?: PaymentGateway } = {},
): Promise<ActionResult> {
  const db = deps.db ?? sharedDb;
  return db.transaction(async (tx): Promise<ActionResult> => {
    const [row] = await tx
      .select({ o: orders, startsAt: tourSessions.startsAt, tourTitle: tours.title })
      .from(orders)
      .innerJoin(tourSessions, eq(orders.sessionId, tourSessions.id))
      .innerJoin(tours, eq(tourSessions.tourId, tours.id))
      .where(eq(orders.id, orderId))
      .for("update", { of: orders });
    if (!row) return { ok: false, error: NOT_FOUND };
    const { o } = row;
    if (o.status !== "paid" || o.paymentId === null) {
      return { ok: false, error: "Отменить билеты можно только в оплаченном заказе" };
    }

    const { children, adults } = tickets;
    const count = (n: number, max: number) => Number.isInteger(n) && n >= 0 && n <= max;
    if (!count(children, o.children) || !count(adults, o.adults) || children + adults < 1) {
      return { ok: false, error: `Можно отменить от 1 билета; в заказе ${formatComposition(o.children, o.adults)}` };
    }
    if (children + adults >= o.children + o.adults) {
      return { ok: false, error: "Это все билеты заказа — используйте «Отменить и вернуть»" };
    }
    const max = Math.min(ticketsValue(o, children, adults), o.total - o.refundedAmount);
    if (!Number.isInteger(amount) || amount < 0 || amount > max) {
      return { ok: false, error: `Сумма возврата — от 0 до ${formatRub(max)}` };
    }

    let refund: GatewayRefund | null = null;
    if (amount > 0) {
      try {
        const gateway = deps.gateway ?? paymentGateway();
        // Возврат мимо сайта: какие билеты вернули в кабинете, неизвестно — заказ закрывается целиком (как и в `refundOrder`).
        if (await reconcileExternalRefund(tx, o, await gateway.getPayment(o.paymentId))) {
          return { ok: false, error: "По заказу уже вернули деньги в кабинете ЮKassa — заказ отменён целиком. Обновите страницу." };
        }
        refund = await createReceiptRefund(gateway, {
          idempotenceKey: refundKey(o.id, await refundCount(tx, o.id)),
          paymentId: o.paymentId,
          amount,
          email: o.email,
          tourTitle: row.tourTitle,
          startsAt: row.startsAt,
        });
      } catch (e) {
        console.error(`Частичная отмена: заказ ${o.id} не изменён`, e);
        return { ok: false, error: `Возврат не прошёл: ${e instanceof Error ? e.message : String(e)}` };
      }
    }

    await tx
      .update(orders)
      .set({
        children: o.children - children,
        adults: o.adults - adults,
        refundedAmount: o.refundedAmount + amount,
        ...(refund ? { refundId: refund.id } : {}),
        updatedAt: new Date(),
      })
      .where(eq(orders.id, o.id));
    await logRefund(tx, { orderId: o.id, amount, children, adults, source: "admin", refundId: refund?.id });
    return { ok: true };
  });
}

export type RefundHistoryRow = { id: number; createdAt: Date; amount: number; children: number; adults: number; source: string };

/** История возвратов заказа для админки — по времени. */
export async function listRefunds(orderId: number, db: Db = sharedDb): Promise<RefundHistoryRow[]> {
  return db
    .select({
      id: orderRefunds.id, createdAt: orderRefunds.createdAt, amount: orderRefunds.amount, children: orderRefunds.children,
      adults: orderRefunds.adults, source: orderRefunds.source,
    })
    .from(orderRefunds)
    .where(eq(orderRefunds.orderId, orderId))
    .orderBy(asc(orderRefunds.createdAt), asc(orderRefunds.id));
}

/**
 * «Перенести»: оплаченный заказ → другой будущий нескрытый сеанс той же экскурсии, где хватает мест.
 * Цены и деньги не трогаются. Блокировки: оба сеанса по возрастанию `id`, затем заказ — тот же порядок «сеанс → заказ»,
 * что у оформления и синхронизации платежа, а между собой переносы не ждут друг друга по кругу.
 * Письмо клиенту отправляет вызывающий (серверное действие) после успеха.
 */
export async function moveOrder(orderId: number, targetSessionId: number, db: Db = sharedDb): Promise<ActionResult> {
  return db.transaction(async (tx): Promise<ActionResult> => {
    const [ref] = await tx.select({ sessionId: orders.sessionId }).from(orders).where(eq(orders.id, orderId));
    if (!ref) return { ok: false, error: NOT_FOUND };

    // По одному, а не одним запросом: порядок блокировок задан явно, а не планом запроса.
    for (const id of [...new Set([ref.sessionId, targetSessionId])].sort((a, b) => a - b)) {
      await tx.execute(sql`select id from tour_sessions where id = ${id} for update`);
    }
    const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!o) return { ok: false, error: NOT_FOUND };
    if (o.sessionId !== ref.sessionId) return { ok: false, error: "Заказ уже изменили — обновите страницу" };
    if (o.status !== "paid") return { ok: false, error: "Перенести можно только оплаченный заказ" };
    if (o.sessionId === targetSessionId) return { ok: false, error: "Заказ уже назначен на этот сеанс" };

    const [current] = await tx.select({ tourId: tourSessions.tourId }).from(tourSessions).where(eq(tourSessions.id, o.sessionId));
    const [target] = await tx
      .select({ tourId: tourSessions.tourId, startsAt: tourSessions.startsAt, capacity: tourSessions.capacity, hidden: tourSessions.hidden })
      .from(tourSessions)
      .where(eq(tourSessions.id, targetSessionId));
    if (!target || target.tourId !== current.tourId || target.hidden || target.startsAt.getTime() <= Date.now()) {
      return { ok: false, error: "Этот сеанс недоступен для переноса" };
    }

    const participants = o.children + o.adults;
    const free = target.capacity - (await occupiedSeats(tx, targetSessionId));
    if (participants > free) return { ok: false, error: `В выбранном сеансе свободно ${Math.max(free, 0)}, в заказе ${participants}` };

    // Напоминание накануне относилось к старой дате — для новой оно должно уйти заново.
    await tx.update(orders).set({ sessionId: targetSessionId, reminderSentAt: null, updatedAt: new Date() }).where(eq(orders.id, o.id));
    return { ok: true };
  });
}

/** Куда можно перенести заказ: будущие нескрытые сеансы той же экскурсии, кроме текущего, со свободными местами ≥ участников. */
export async function listMoveTargets(orderId: number, db: Db = sharedDb): Promise<{ id: number; startsAt: Date; free: number }[]> {
  const [o] = await db
    .select({ sessionId: orders.sessionId, children: orders.children, adults: orders.adults, tourId: tourSessions.tourId })
    .from(orders)
    .innerJoin(tourSessions, eq(orders.sessionId, tourSessions.id))
    .where(eq(orders.id, orderId));
  if (!o) return [];
  const participants = o.children + o.adults;

  const rows = await db
    .select({ id: tourSessions.id, startsAt: tourSessions.startsAt, capacity: tourSessions.capacity, taken: seatsTakenSql() })
    .from(tourSessions)
    .leftJoin(orders, eq(orders.sessionId, tourSessions.id))
    .where(and(eq(tourSessions.tourId, o.tourId), eq(tourSessions.hidden, false), gt(tourSessions.startsAt, new Date()), ne(tourSessions.id, o.sessionId)))
    .groupBy(tourSessions.id)
    .orderBy(asc(tourSessions.startsAt), asc(tourSessions.id));
  return rows
    .map((r) => ({ id: r.id, startsAt: r.startsAt, free: r.capacity - r.taken }))
    .filter((r) => r.free >= participants);
}
