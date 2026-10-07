import { eq } from "drizzle-orm";
import { db as sharedDb, type Db } from "@/db/client";
import { orders } from "@/db/schema";
import type { OrderStatus } from "@/lib/domain/order-status";
import { FINAL_PAYMENT_STATUSES, syncPayment, type SyncOutcome } from "@/server/payment-sync";
import { paymentGateway } from "@/server/payments/gateway";
import type { PaymentGateway } from "@/server/payments/types";
import { loadTicket } from "@/server/ticket";
import type { TicketData } from "@/server/mail/templates";

/** `declined` — тот же «не оплачен» (`expired`), но платёж ЮKassa отменён: карту отклонили или оплату прервали. */
export type OrderView = "awaiting" | "paid" | "expired" | "declined" | "cancelled";
export type OrderPageData = { view: OrderView; ticket: TicketData; refunded: number };

/** 32 байта в base64url — ровно то, что выдаёт `startCheckout`. */
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** Старые заявки (`new` / `confirmed`) страницы заказа не имеют. */
const VIEWS: Partial<Record<OrderStatus, OrderView>> = {
  awaiting_payment: "awaiting",
  paid: "paid",
  done: "paid",
  expired: "expired",
  cancelled: "cancelled",
};

const findByToken = async (db: Db, token: string) =>
  (await db
    .select({ id: orders.id, status: orders.status, paymentId: orders.paymentId, paymentStatus: orders.paymentStatus, refunded: orders.refundedAmount })
    .from(orders)
    .where(eq(orders.accessToken, token)))[0];

/**
 * Платёж, который ещё может завершиться: у заказа «ждёт оплаты» — любой; у снятого с удержания (`expired`: «Изменить»,
 * 15 минут вышли) — пока ЮKassa не назвала конечный статус: клиент мог оплатить в банковском приложении уже после этого.
 */
const mayChange = (o: { status: OrderStatus; paymentStatus: string | null }) =>
  o.status === "awaiting_payment" || (o.status === "expired" && (o.paymentStatus === null || !FINAL_PAYMENT_STATUSES.includes(o.paymentStatus)));

/**
 * Данные страницы `/order/<token>`; `null` — токен не наш или заказ без страницы (→ `notFound()`).
 *
 * Запасной канал на случай задержки webhook: заказ «ждёт оплаты» с платежом (и снятый с удержания, чей платёж ещё
 * не завершён) синхронизируется с ЮKassa прямо при открытии. Остальные заказы шлюз не трогают. Сбой синка (ЮKassa
 * недоступна, не настроена) клиенту не показываем: страница рисуется по текущему состоянию БД. Исход синка возвращается —
 * письма и Telegram вызывающий запускает после ответа (`runSyncEffects`). Токен — секрет страницы: в лог не пишем.
 */
export async function loadOrderPage(
  token: string,
  deps: { db?: Db; gateway?: PaymentGateway } = {},
): Promise<{ data: OrderPageData; outcome: SyncOutcome | null } | null> {
  if (!TOKEN.test(token)) return null;
  const db = deps.db ?? sharedDb;

  let order = await findByToken(db, token);
  if (!order) return null;

  let outcome: SyncOutcome | null = null;
  if (order.paymentId && mayChange(order)) {
    try {
      // Настоящий шлюз создаётся только здесь, когда синк действительно нужен.
      outcome = await syncPayment(order.paymentId, "sync", { db, gateway: deps.gateway ?? paymentGateway() });
    } catch (e) {
      console.error(`Страница заказа: синк платежа заказа ${order.id} не удался`, e);
    }
    // Синк мог перевести заказ в другое состояние — рисуем уже его.
    if (outcome) order = (await findByToken(db, token)) ?? order;
  }

  const view = order.status === "expired" && order.paymentStatus === "canceled" ? "declined" : VIEWS[order.status];
  if (!view) return null;
  const ticket = await loadTicket(order.id, db);
  if (!ticket) return null;
  return { data: { view, ticket, refunded: order.refunded }, outcome };
}
