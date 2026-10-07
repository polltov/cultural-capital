import { and, asc, eq, isNotNull, isNull, lt, or } from "drizzle-orm";
import { db as sharedDb, type Db } from "@/db/client";
import { orders, tours, tourSessions } from "@/db/schema";
import { paymentItems } from "@/lib/domain/receipt";
import { runSyncEffects, syncPayment } from "@/server/payment-sync";
import { closingReceiptsEnabled, paymentGateway, vatCode } from "@/server/payments/gateway";
import type { PaymentGateway } from "@/server/payments/types";

/** Сколько заказов обработано за ночь; `errors` — заказы, на которых что-то упало (повтор — следующей ночью). */
export type NightlyReport = { synced: number; expired: number; closed: number; done: number; errors: number };

/** Заказ считается проведённым, когда с начала сеанса прошло больше этого времени. */
const AFTER_START_MS = 3 * 3600_000;

/**
 * Ночная уборка платежей. Порядок важен: сначала опрос платежей по заказам с истёкшим удержанием (webhook мог потеряться,
 * автовозврат поздней оплаты — не пройти), потом закрытие неоплаченных, потом чеки и «Проведён» по прошедшим сеансам.
 * Каждый заказ — в своём try/catch: сбой одного (шлюз, БД, неверная ставка НДС) считается и не останавливает остальных.
 */
export async function runNightly(deps: { db?: Db; gateway?: PaymentGateway; now?: Date; closing?: boolean } = {}): Promise<NightlyReport> {
  const db = deps.db ?? sharedDb;
  const now = deps.now ?? new Date();
  const closing = deps.closing ?? closingReceiptsEnabled();
  const report: NightlyReport = { synced: 0, expired: 0, closed: 0, done: 0, errors: 0 };

  // Шлюз — лениво и внутри try заказа: без настроек ЮKassa (или когда обрабатывать нечего) ночная задача не падает целиком.
  let gateway = deps.gateway;
  const gatewayOrThrow = () => (gateway ??= paymentGateway());
  /** В логе только id заказа и ошибка: ни токена страницы заказа, ни email покупателя. */
  const failed = (what: string, orderId: number, e: unknown) => {
    report.errors++;
    console.error(`Ночная задача (${what}): сбой для заказа ${orderId}`, e);
  };

  // 1а. Опрос платежей: удержание истекло (подберёт оплаты, чьи уведомления потерялись) и заказы `expired`, по которым платёж
  // прошёл, а поздний автовозврат не удался (их оставляет syncPayment; клиенту обещан повтор ночью).
  const toSync = await db
    .select({ id: orders.id, paymentId: orders.paymentId })
    .from(orders)
    .where(
      and(
        isNotNull(orders.paymentId),
        or(
          and(eq(orders.status, "awaiting_payment"), lt(orders.holdExpiresAt, now)),
          and(eq(orders.status, "expired"), eq(orders.paymentStatus, "succeeded")),
        ),
      ),
    )
    .orderBy(asc(orders.id));
  const unknownPayment = new Set<number>();
  for (const o of toSync) {
    try {
      const outcome = await syncPayment(o.paymentId!, "cron", { db, gateway: gatewayOrThrow() });
      await runSyncEffects(outcome, db);
      report.synced++;
    } catch (e) {
      unknownPayment.add(o.id);
      failed("опрос платежа", o.id, e);
    }
  }

  // 1б. Кого не оплатили — `expired`. Места такие заказы и так не занимали (удержание истекло); заказ с неопрошенным платежом
  // не трогаем: его судьба неизвестна, он повторится следующей ночью.
  const lapsed = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.status, "awaiting_payment"), lt(orders.holdExpiresAt, now)))
    .orderBy(asc(orders.id));
  for (const o of lapsed) {
    if (unknownPayment.has(o.id)) continue;
    try {
      // Условие повторено в UPDATE: пока шли опросы, заказ могли оплатить (webhook) — такой не трогаем.
      const res = await db
        .update(orders)
        .set({ status: "expired", updatedAt: new Date() })
        .where(and(eq(orders.id, o.id), eq(orders.status, "awaiting_payment"), lt(orders.holdExpiresAt, now)))
        .returning({ id: orders.id });
      if (res.length > 0) report.expired++;
    } catch (e) {
      failed("истечение удержания", o.id, e);
    }
  }

  // 2. Прошедшие сеансы: закрывающий чек (только при RECEIPT_CLOSING=on) и `paid` → `done`. Сюда попадают и заказы, которые админ
  // отметил проведёнными вручную (им нужен только чек); заказы без `payment_id` (старые заявки) — нет. Оплаченный заказ, чей чек
  // уже выбит, а «Проведён» не записался, всё равно подбирается — иначе он завис бы в `paid`.
  const over = await db
    .select({
      id: orders.id, status: orders.status, paymentId: orders.paymentId, email: orders.email, total: orders.total,
      closingReceiptAt: orders.closingReceiptAt, children: orders.children, adults: orders.adults,
      priceChild: orders.priceChildSnapshot, priceAdult: orders.priceAdultSnapshot,
      startsAt: tourSessions.startsAt, tourTitle: tours.title,
    })
    .from(orders)
    .innerJoin(tourSessions, eq(orders.sessionId, tourSessions.id))
    .innerJoin(tours, eq(tourSessions.tourId, tours.id))
    .where(
      and(
        isNotNull(orders.paymentId),
        lt(tourSessions.startsAt, new Date(now.getTime() - AFTER_START_MS)),
        or(
          eq(orders.status, "paid"),
          closing ? and(eq(orders.status, "done"), isNull(orders.closingReceiptAt)) : undefined,
        ),
      ),
    )
    .orderBy(asc(orders.id));
  for (const o of over) {
    try {
      if (closing && o.closingReceiptAt === null) {
        if (!o.email) throw new Error("у заказа нет email для закрывающего чека");
        await gatewayOrThrow().createReceipt({
          idempotenceKey: `closing-${o.id}`,
          paymentId: o.paymentId!,
          customerEmail: o.email,
          items: paymentItems(o, vatCode(), "full_payment"),
          prepaymentAmount: o.total,
        });
        // Метка — только после успеха: при сбое чек повторится следующей ночью (с тем же ключом идемпотентности).
        await db.update(orders).set({ closingReceiptAt: new Date(), updatedAt: new Date() }).where(eq(orders.id, o.id));
        report.closed++;
      }
      if (o.status === "paid") {
        // `paid` в условии: заказ могли успеть вернуть из админки.
        const res = await db
          .update(orders)
          .set({ status: "done", updatedAt: new Date() })
          .where(and(eq(orders.id, o.id), eq(orders.status, "paid")))
          .returning({ id: orders.id });
        if (res.length > 0) report.done++;
      }
    } catch (e) {
      failed("чек и «Проведён»", o.id, e);
    }
  }

  return report;
}
