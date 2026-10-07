import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db as sharedDb, type Db } from "@/db/client";
import { orders, tours, tourSessions } from "@/db/schema";
import { checkoutSchema, type CheckoutResult } from "@/lib/validation/checkout";
import { orderTotal } from "@/lib/domain/pricing";
import { formatOrderNumber } from "@/lib/domain/order-number";
import { HOLD_MINUTES } from "@/lib/domain/seats";
import { paymentDescription, paymentItems } from "@/lib/domain/receipt";
import { hitRateLimit } from "@/server/rate-limit";
import { occupiedSeats } from "@/server/orders";
import { paymentGateway, vatCode } from "@/server/payments/gateway";
import type { PaymentGateway } from "@/server/payments/types";
import { notifyAlert } from "@/server/telegram";

const RATE_LIMIT = 10;
const RATE_WINDOW_SEC = 3600;

const UNAVAILABLE = "Этот сеанс недоступен для покупки";
const GATEWAY_DOWN = "Оплата временно недоступна. Попробуйте позже или позвоните нам.";

/**
 * Тревога владельцу: платежи не создаются. Такой сбой обычно у всех покупателей сразу (ключи, блокировка магазина, ставка НДС),
 * поэтому — не чаще раза в час. В тексте только ошибка шлюза: ни данных покупателя, ни токенов. Никогда не бросает —
 * покупатель получает свой ответ в любом случае.
 */
async function alertGatewayDown(e: unknown, db: Db): Promise<void> {
  try {
    if (!(await hitRateLimit("alert:checkout", 1, 3600, db))) return;
    const message = Array.from(e instanceof Error ? e.message : String(e)).slice(0, 200).join("");
    await notifyAlert(`Оплата на сайте не создаётся: ${message} — проверьте настройки ЮKassa`);
  } catch (err) {
    console.error("Оплата: тревога о сбое не отправлена", err);
  }
}

/** Заказ с удержанием мест на 15 минут + платёж в ЮKassa. Шлюз по умолчанию создаётся лениво — только если дошли до оплаты. */
export async function startCheckout(
  input: unknown,
  ip: string,
  deps: { db?: Db; gateway?: PaymentGateway } = {},
): Promise<CheckoutResult> {
  const db = deps.db ?? sharedDb;

  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<string, string>> = {};
    for (const i of parsed.error.issues) {
      const k = String(i.path[0] ?? "form");
      fieldErrors[k] ??= i.message;
    }
    return { ok: false, fieldErrors };
  }
  const v = parsed.data;
  if (v.website) return { ok: false };

  if (!(await hitRateLimit(`checkout:${ip}`, RATE_LIMIT, RATE_WINDOW_SEC, db))) {
    return { ok: false, error: "Слишком много попыток. Попробуйте позже или позвоните нам." };
  }

  const accessToken = randomBytes(32).toString("base64url");
  const holdExpiresAt = new Date(Date.now() + HOLD_MINUTES * 60_000);

  // Блокировка сеанса сериализует параллельные покупки последних мест (порядок «сеанс → заказ», как в transitionOrder).
  const held = await db.transaction(async (tx) => {
    const [locked] = await tx.execute<{ id: number }>(sql`select id from tour_sessions where id = ${v.sessionId} for update`);
    if (!locked) return { error: UNAVAILABLE } as const;

    const [s] = await tx
      .select({
        id: tourSessions.id, startsAt: tourSessions.startsAt, capacity: tourSessions.capacity, hidden: tourSessions.hidden,
        published: tours.published, tourTitle: tours.title, priceChild: tours.priceChild, priceAdult: tours.priceAdult,
      })
      .from(tourSessions)
      .innerJoin(tours, eq(tourSessions.tourId, tours.id))
      .where(eq(tourSessions.id, locked.id));
    if (s.hidden || !s.published || s.startsAt.getTime() <= Date.now()) return { error: UNAVAILABLE } as const;

    const free = s.capacity - (await occupiedSeats(tx, s.id));
    if (v.children + v.adults > free) {
      return { error: free > 0 ? `Осталось мест: ${free}` : "Мест не осталось" } as const;
    }

    // Сумма — только из цен в БД; слепки цен фиксируются в заказе.
    const total = orderTotal({ children: v.children, adults: v.adults, priceChild: s.priceChild, priceAdult: s.priceAdult });
    const [o] = await tx
      .insert(orders)
      .values({
        sessionId: s.id, customerName: v.name, phone: v.phone, email: v.email,
        children: v.children, adults: v.adults, priceChildSnapshot: s.priceChild, priceAdultSnapshot: s.priceAdult, total,
        status: "awaiting_payment", holdExpiresAt, accessToken, consentAt: new Date(),
      })
      .returning({ id: orders.id, number: orders.number });
    return { order: { ...o, total }, session: s } as const;
  });
  if ("error" in held) return { ok: false, error: held.error };
  const { order, session: s } = held;

  // Платёж создаём вне транзакции: блокировка сеанса не держится на время сетевого вызова.
  let payment;
  try {
    const gateway = deps.gateway ?? paymentGateway();
    const items = paymentItems(
      { tourTitle: s.tourTitle, startsAt: s.startsAt, children: v.children, adults: v.adults, priceChild: s.priceChild, priceAdult: s.priceAdult },
      vatCode(),
      "full_prepayment",
    );
    payment = await gateway.createPayment({
      idempotenceKey: accessToken,
      amount: order.total,
      description: paymentDescription(formatOrderNumber(order.number), s.tourTitle, s.startsAt),
      orderId: order.id,
      // ЮKassa ждёт телефон цифрами, без «+»
      customer: { email: v.email, phone: v.phone.replace(/^\+/, ""), fullName: v.name },
      items,
    });
    if (!payment.confirmationToken) throw new Error("ЮKassa не вернула confirmation_token");
  } catch (e) {
    // Любой сбой (сеть, отказ ЮKassa, не настроены ключи, неверная ставка НДС): места освобождаем сразу.
    console.error(`Оплата: платёж не создан, заказ ${order.id} снят с удержания`, e);
    await db
      .update(orders)
      .set({ status: "expired", updatedAt: new Date() })
      .where(and(eq(orders.id, order.id), eq(orders.status, "awaiting_payment")));
    await alertGatewayDown(e, db);
    return { ok: false, error: GATEWAY_DOWN };
  }

  await db
    .update(orders)
    .set({ paymentId: payment.id, paymentStatus: payment.status, updatedAt: new Date() })
    .where(eq(orders.id, order.id));
  // Остаток удержания считаем здесь, после вызова ЮKassa: абсолютное время клиенту ни к чему — его часы могут спешить или отставать.
  const holdSeconds = Math.max(0, Math.floor((holdExpiresAt.getTime() - Date.now()) / 1000));
  return { ok: true, orderToken: accessToken, confirmationToken: payment.confirmationToken, holdSeconds };
}

/** «Изменить» / «Начать заново»: снимает удержание. Только awaiting_payment → expired; платёж в ЮKassa не трогаем. */
export async function releaseHold(orderToken: string, db: Db = sharedDb): Promise<void> {
  await db
    .update(orders)
    .set({ status: "expired", updatedAt: new Date() })
    .where(and(eq(orders.accessToken, orderToken), eq(orders.status, "awaiting_payment")));
}
