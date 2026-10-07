import { and, eq, sql } from "drizzle-orm";
import { db as sharedDb, type Db, type Tx } from "@/db/client";
import { orders, paymentEvents, tours, tourSessions } from "@/db/schema";
import { formatOrderNumber } from "@/lib/domain/order-number";
import { toApiAmount } from "@/lib/domain/pricing";
import { occupiedSeats } from "@/server/orders";
import { paymentGateway } from "@/server/payments/gateway";
import { createReceiptRefund } from "@/server/payments/refund";
import type { GatewayRefund, PaymentGateway } from "@/server/payments/types";
import { reconcileExternalRefund } from "@/server/refunds";
import { notifyAlert, notifyPaidOrder } from "@/server/telegram";
import { sendCancelled, sendSorry, sendTicket } from "@/server/ticket";

export type SyncOutcome = {
  kind:
    | "paid"
    | "late_paid"
    | "late_refunded"
    | "late_refund_failed"
    | "refunded_externally"
    | "expired"
    | "mismatch"
    | "noop"
    | "unknown";
  orderId?: number;
};
type SyncKind = SyncOutcome["kind"];
type Source = "webhook" | "sync" | "cron";

/**
 * Конечные статусы платежа ЮKassa. Заказ `expired`, чей платёж ещё не в них (клиент нажал «Изменить» или не успел за 15 минут,
 * а оплата в банковском приложении всё же могла пройти), опрашивают страница заказа и ночная задача. Набор сам себя ограничивает:
 * `syncPayment` всегда записывает последний статус платежа, а неоплаченный платёж ЮKassa сама отменяет через час.
 */
export const FINAL_PAYMENT_STATUSES: readonly string[] = ["succeeded", "canceled"];

/** Запись в журнал платежей (`payment_events`). Внутри транзакции передаётся её `tx`. */
export async function recordPaymentEvent(
  e: { source: Source; event: string; paymentId: string; orderId?: number | null; payload: unknown; note?: string },
  db: Db | Tx = sharedDb,
): Promise<void> {
  await db.insert(paymentEvents).values({
    source: e.source, event: e.event, paymentId: e.paymentId, orderId: e.orderId ?? null, payload: e.payload, note: e.note ?? "",
  });
}

/** `metadata.order_id` → id заказа; всё, что не похоже на int4 > 0, — не наш платёж. */
function parseOrderId(raw: string | undefined): number | null {
  if (!raw || !/^[1-9]\d{0,9}$/.test(raw)) return null;
  const id = Number(raw);
  return id <= 2_147_483_647 ? id : null;
}

/** Ответ API в журнал целиком; токен виджета (`confirmation.confirmation_token`) — одноразовый секрет оплаты, ему там не место. */
export function withoutConfirmationToken(raw: unknown): unknown {
  const confirmation = (raw as { confirmation?: unknown } | null | undefined)?.confirmation;
  if (!confirmation || typeof confirmation !== "object" || !("confirmation_token" in confirmation)) return raw;
  return { ...(raw as object), confirmation: { ...confirmation, confirmation_token: null } };
}

/** Есть ли в журнале запись по платежу с такой пометкой (`note`). */
export async function hasJournalNote(db: Db | Tx, paymentId: string, note: string): Promise<boolean> {
  const [r] = await db
    .select({ id: paymentEvents.id })
    .from(paymentEvents)
    .where(and(eq(paymentEvents.paymentId, paymentId), eq(paymentEvents.note, note)))
    .limit(1);
  return r !== undefined;
}

/**
 * Единственное место, где статус заказа меняется по статусу платежа ЮKassa (возвраты мимо сайта сверяет
 * `reconcileExternalRefund`). Объект платежа берётся из API
 * (данным из уведомления не доверяем). Ошибки `getPayment` и БД не глотаем: webhook ответит 500 и ЮKassa повторит.
 * Побочные эффекты (письма, Telegram) — отдельно, `runSyncEffects` после коммита.
 */
export async function syncPayment(
  paymentId: string,
  source: Source,
  deps: { db?: Db; gateway?: PaymentGateway } = {},
): Promise<SyncOutcome> {
  const db = deps.db ?? sharedDb;
  const gateway = deps.gateway ?? paymentGateway();
  const payment = await gateway.getPayment(paymentId);

  const payload = withoutConfirmationToken(payment.raw);
  const journal = (d: Db | Tx, orderId: number | null, note: string) =>
    recordPaymentEvent({ source, event: `payment.${payment.status}`, paymentId, orderId, payload, note }, d);

  const orderId = parseOrderId(payment.metadata.order_id);
  const [ref] = orderId === null ? [] : await db.select({ sessionId: orders.sessionId }).from(orders).where(eq(orders.id, orderId));
  if (orderId === null || !ref) {
    await journal(db, null, "unknown");
    return { kind: "unknown" };
  }

  return db.transaction(async (tx): Promise<SyncOutcome> => {
    // Порядок блокировок «сеанс → заказ», как в transitionOrder и startCheckout (без взаимных дедлоков).
    // `of`: блокируется только строка сеанса, а не экскурсии.
    const [session] = await tx
      .select({ capacity: tourSessions.capacity, startsAt: tourSessions.startsAt, tourTitle: tours.title })
      .from(tourSessions)
      .innerJoin(tours, eq(tourSessions.tourId, tours.id))
      .where(eq(tourSessions.id, ref.sessionId))
      .for("update", { of: tourSessions });
    // Истечение удержания — по часам БД, как в `seatsTakenSql`: ровно тогда заказ перестаёт занимать места.
    const [row] = await tx
      .select({ o: orders, holdLapsed: sql<boolean>`(${orders.holdExpiresAt} is null or ${orders.holdExpiresAt} <= now())` })
      .from(orders)
      .where(eq(orders.id, orderId))
      .for("update");
    const o = row?.o;

    // Заказ привязан к другому платёжу — это не наш платёж (и записывать в него `payment_id` нельзя).
    if (!session || !row || !o || (o.paymentId !== null && o.paymentId !== paymentId)) {
      await journal(tx, null, "unknown");
      return { kind: "unknown" };
    }

    // Привязка платежа (если `payment_id` не успели сохранить) и его статус пишутся при любом исходе.
    const patch: Partial<typeof orders.$inferInsert> = {};
    if (o.paymentId === null) patch.paymentId = paymentId;
    if (o.paymentStatus !== payment.status) patch.paymentStatus = payment.status;
    /** `note` журнала по умолчанию равна исходу; отличается там, где исход и событие — разные вещи. */
    const finish = async (kind: SyncKind, extra: typeof patch = {}, note: string = kind): Promise<SyncOutcome> => {
      const set = { ...patch, ...extra };
      if (Object.keys(set).length > 0) await tx.update(orders).set({ ...set, updatedAt: new Date() }).where(eq(orders.id, o.id));
      await journal(tx, o.id, note);
      return { kind, orderId: o.id };
    };

    if (payment.status === "canceled") {
      return o.status === "awaiting_payment" ? finish("expired", { status: "expired" }) : finish("noop");
    }
    if (payment.status !== "succeeded") return finish("noop");

    // Сумма — только по заказу (слепок цен), не по текущим ценам экскурсии. Алерт («mismatch») — один раз на платёж:
    // дальше (страница заказа опрашивает каждые 3 с, ночная задача) — `noop`, но в журнал событие всё равно пишется.
    if (payment.amount.value !== toApiAmount(o.total) || payment.amount.currency !== "RUB") {
      return finish((await hasJournalNote(tx, paymentId, "mismatch")) ? "noop" : "mismatch");
    }

    if (o.status !== "awaiting_payment" && o.status !== "expired") return finish("noop"); // paid / done / cancelled — повторное уведомление
    // Без проверки мест оплачивается только заказ с действующим удержанием: его места за ним.
    if (o.status === "awaiting_payment" && !row.holdLapsed) return finish("paid", { status: "paid", paidAt: new Date() });

    // Поздняя оплата (заказ `expired` или удержание уже истекло): такой заказ мест не занимает и их могли купить другие,
    // поэтому свободные места под его участников проверяем заново — под блокировкой сеанса, места не перепродаём.
    // Исключение — платёж, по которому автовозврат уже падал: решение «возвращаем» необратимо. Деньги могли вернуться
    // (наш вызов завис, а ЮKassa его провела; владелец вернул вручную) — повторная проверка мест, нашедшая места,
    // выдала бы билет за возвращённые деньги.
    const refundFailedBefore = await hasJournalNote(tx, paymentId, "late_refund_failed");
    if (refundFailedBefore) {
      if (payment.refundedAmount !== null && Number(payment.refundedAmount) >= o.total) {
        return finish("late_refunded", { status: "cancelled", refundedAmount: o.total }, "refunded_externally");
      }
    } else if (o.children + o.adults <= session.capacity - (await occupiedSeats(tx, o.sessionId))) {
      return finish("late_paid", { status: "paid", paidAt: new Date() });
    }

    // Мест нет (или возврат уже пробовали) — полный возврат. Вызов шлюза идёт под блокировкой: параллельный синк
    // дождётся и увидит `cancelled`. При сбое заказ остаётся (становится) `expired`; повторный синк повторит возврат
    // с тем же ключом идемпотентности. Тревогу (`late_refund_failed`) поднимает только первый сбой, дальше — `noop`.
    let refund: GatewayRefund;
    try {
      refund = await createReceiptRefund(gateway, {
        idempotenceKey: `late-refund-${o.id}`,
        paymentId,
        amount: o.total,
        email: o.email,
        tourTitle: session.tourTitle,
        startsAt: session.startsAt,
      });
    } catch (e) {
      console.error(`Поздняя оплата: автовозврат заказа ${o.id} не прошёл`, e);
      // Оплатить такой заказ уже нельзя, а возврат ждёт повтора: `expired` + `payment_status = succeeded` (по ним его найдёт ночная задача).
      return finish(refundFailedBefore ? "noop" : "late_refund_failed", o.status === "awaiting_payment" ? { status: "expired" } : {}, "late_refund_failed");
    }
    return finish("late_refunded", { status: "cancelled", refundedAmount: o.total, refundId: refund.id });
  });
}

/**
 * Уведомление `refund.succeeded` — только проверенные роутом поля: `id` и `payment_id` прошли проверку формата,
 * остальные строки обрезаны (тело не подписано, целиком в журнал его не пишем).
 */
export type RefundNotice = {
  id: string;
  payment_id: string;
  status: string | null;
  amount: { value: string | null; currency: string | null };
};

/**
 * `refund.succeeded`: возврат по нашему платежу. Возвраты сайта (`refundOrder`, автовозврат поздней оплаты) к этому моменту
 * уже отражены в заказе; новость — только возврат, оформленный в кабинете ЮKassa. Сколько возвращено, берём из API
 * (`getPayment`), а не из тела уведомления, и сверяем под блокировкой заказа (`reconcileExternalRefund`).
 * Чужой платёж — ничего не пишем: журнал не должен расти от неподписанных запросов. Ошибки шлюза и БД не глотаем
 * (webhook ответит 500, ЮKassa повторит); журнал пишется в той же транзакции, так что повтор не оставит дубля.
 */
export async function syncRefund(
  notice: RefundNotice,
  deps: { db?: Db; gateway?: PaymentGateway } = {},
): Promise<SyncOutcome> {
  const db = deps.db ?? sharedDb;
  const paymentId = notice.payment_id;
  const [ref] = await db.select({ id: orders.id }).from(orders).where(eq(orders.paymentId, paymentId));
  if (!ref) return { kind: "unknown" };

  return db.transaction(async (tx): Promise<SyncOutcome> => {
    // Блокируется только строка заказа, как в `refundOrder`: идущий из админки возврат уведомление дождётся.
    const [o] = await tx.select().from(orders).where(eq(orders.id, ref.id)).for("update");
    if (!o || o.paymentId !== paymentId) return { kind: "unknown" };
    await recordPaymentEvent({ source: "webhook", event: "refund.succeeded", paymentId, orderId: o.id, payload: notice, note: "refund.succeeded" }, tx);
    const payment = await (deps.gateway ?? paymentGateway()).getPayment(paymentId);
    return { kind: (await reconcileExternalRefund(tx, o, payment)) ? "refunded_externally" : "noop", orderId: o.id };
  });
}

/** «КС-0057»; если заказ не прочитался — «#id»: тревога важнее красивого номера. Не бросает. */
async function orderLabel(orderId: number, db: Db): Promise<string> {
  try {
    const [r] = await db.select({ number: orders.number }).from(orders).where(eq(orders.id, orderId));
    if (r) return formatOrderNumber(r.number);
  } catch (e) {
    console.error(`Эффекты оплаты: не прочитан номер заказа ${orderId}`, e);
  }
  return `#${orderId}`;
}

/**
 * Письма и Telegram после коммита `syncPayment` (вызывается из `after()`). Никогда не бросает:
 * сбой одного шага логируется и не мешает остальным.
 */
export async function runSyncEffects(o: SyncOutcome, db: Db = sharedDb): Promise<void> {
  const id = o.orderId;
  if (id === undefined) return;
  const attempt = async (what: string, f: () => Promise<unknown>) => {
    try {
      await f();
    } catch (e) {
      console.error(`Эффекты оплаты (${what}): сбой для заказа ${id}`, e);
    }
  };
  const alert = (text: (number: string) => string) =>
    attempt("тревога в Telegram", async () => notifyAlert(text(await orderLabel(id, db))));

  switch (o.kind) {
    case "paid":
    case "late_paid":
      await Promise.all([attempt("письмо с билетом", () => sendTicket(id, "paid")), attempt("Telegram", () => notifyPaidOrder(id))]);
      return;
    case "late_refunded":
      await Promise.all([
        attempt("письмо-извинение", () => sendSorry(id)),
        alert((n) => `Поздняя оплата ${n}: мест нет, оформлен автовозврат`),
      ]);
      return;
    case "late_refund_failed":
      await alert((n) => `Поздняя оплата ${n}: мест нет, автовозврат не прошёл. Сайт повторит попытку ночью; если вернёте деньги вручную в кабинете ЮKassa, заказ закроется автоматически.`);
      return;
    case "refunded_externally":
      await Promise.all([
        attempt("письмо об отмене", () => sendCancelled(id)),
        alert((n) => `Возврат по заказу ${n} оформлен в кабинете ЮKassa — на сайте заказ отменён автоматически`),
      ]);
      return;
    case "mismatch":
      await alert((n) => `Сумма платежа не совпала с заказом ${n}`);
      return;
  }
}
