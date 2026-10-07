import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, paymentEvents, tours, tourSessions } from "@/db/schema";
import { formatOrderNumber } from "@/lib/domain/order-number";
import { occupiedSeats } from "@/server/orders";
import { sendCancelled, sendSorry, sendTicket } from "@/server/ticket";
import { notifyAlert, notifyPaidOrder } from "@/server/telegram";
import type { FakeGateway } from "../support/fake-gateway";
import { fakeGateway } from "../support/fake-gateway";
import { lockOrder, whileLocked } from "../support/lock-gate";

// Роут целиком на тестовой БД: шлюз — подделка, `after()` копит колбэки (их запускает тест), письма и Telegram — заглушки.
const state = vi.hoisted(() => ({ gw: undefined as unknown as FakeGateway, after: [] as (() => unknown)[] }));
vi.mock("@/server/payments/gateway", async (orig) => ({
  ...(await orig<typeof import("@/server/payments/gateway")>()),
  paymentGateway: () => state.gw,
}));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void state.after.push(fn) }));
vi.mock("@/server/ticket", () => ({ sendTicket: vi.fn(), sendSorry: vi.fn(), sendCancelled: vi.fn() }));
vi.mock("@/server/telegram", () => ({ notifyPaidOrder: vi.fn(), notifyAlert: vi.fn() }));

import { POST } from "@/app/api/payments/yookassa/route";

const H = 3600_000;
let gw: FakeGateway;
let log: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  gw = state.gw = fakeGateway();
  state.after = [];
  for (const f of [sendTicket, sendSorry, sendCancelled, notifyPaidOrder, notifyAlert]) vi.mocked(f).mockReset();
  log = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => log.mockRestore());

/** Оплаченный заказ на 2 детей + 1 взрослого (3270 ₽), платёж pay-1 есть и в подделке шлюза. */
async function paidOrder(over: Partial<typeof orders.$inferInsert> = {}) {
  const [t] = await db.insert(tours).values({ slug: "a", title: "Эрмитаж", durationLabel: "2 часа", ageLabel: "6+", priceChild: 1000, priceAdult: 1270, published: true }).returning();
  const [s] = await db.insert(tourSessions).values({ tourId: t.id, startsAt: new Date(Date.now() + 48 * H), capacity: 8 }).returning();
  const [o] = await db
    .insert(orders)
    .values({
      sessionId: s.id, customerName: "Анна", phone: "+79991234567", email: "anna@example.com", children: 2, adults: 1,
      priceChildSnapshot: 1000, priceAdultSnapshot: 1270, total: 3270, status: "paid", paymentId: "pay-1", paymentStatus: "succeeded",
      paidAt: new Date(), consentAt: new Date(), accessToken: "t".repeat(43), ...over,
    })
    .returning();
  gw.addPayment("pay-1", { amount: 3270, orderId: o.id });
  return { o, s };
}

const refundNotice = (over: Record<string, unknown> = {}) => ({
  type: "notification",
  event: "refund.succeeded",
  object: { id: "ref-dash", payment_id: "pay-1", status: "succeeded", amount: { value: "3270.00", currency: "RUB" }, description: "Возврат", ...over },
});
const post = (body: unknown) =>
  POST(new Request("http://x.test/api/payments/yookassa", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));
const orderOf = async (id: number) => (await db.select().from(orders).where(eq(orders.id, id)))[0];
const journal = () => db.select().from(paymentEvents).orderBy(paymentEvents.id);
/** Колбэки `after()` — как после ответа ЮKassa. */
const runAfter = () => Promise.all(state.after.splice(0).map((f) => f()));

describe("refund.succeeded: возврат оформлен в кабинете ЮKassa", () => {
  it("оплаченный заказ отменяется с суммой из API, владелец получает тревогу, клиент — письмо об отмене", async () => {
    const { o, s } = await paidOrder();
    gw.setRefunded("pay-1", 3270);

    expect((await post(refundNotice())).status).toBe(200);

    expect(await orderOf(o.id)).toMatchObject({ status: "cancelled", refundedAmount: 3270, refundId: null });
    expect(await occupiedSeats(db, s.id)).toBe(0);
    expect(sendCancelled).not.toHaveBeenCalled(); // письма и Telegram — только после ответа

    await runAfter();
    expect(sendCancelled).toHaveBeenCalledExactlyOnceWith(o.id);
    expect(notifyAlert).toHaveBeenCalledExactlyOnceWith(
      `Возврат по заказу ${formatOrderNumber(o.number)} оформлен в кабинете ЮKassa — на сайте заказ отменён автоматически`,
    );
    expect(sendTicket).not.toHaveBeenCalled();
    expect(sendSorry).not.toHaveBeenCalled();
  });

  it("в журнал — одна строка с заказом и только проверенными полями уведомления", async () => {
    const { o } = await paidOrder();
    gw.setRefunded("pay-1", 3270);

    await post(refundNotice({ status: "s".repeat(5000), metadata: { secret: "x" } }));

    const rows = await journal();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: "webhook", event: "refund.succeeded", paymentId: "pay-1", orderId: o.id, note: "refund.succeeded" });
    expect(rows[0].payload).toEqual({ id: "ref-dash", payment_id: "pay-1", status: "s".repeat(100), amount: { value: "3270.00", currency: "RUB" } });
  });

  it("частичный возврат в кабинете — заказ отменён с фактически возвращённой суммой", async () => {
    const { o } = await paidOrder();
    gw.setRefunded("pay-1", 1000);

    expect((await post(refundNotice({ amount: { value: "1000.00", currency: "RUB" } }))).status).toBe(200);
    expect(await orderOf(o.id)).toMatchObject({ status: "cancelled", refundedAmount: 1000 });
  });

  it("сумма берётся из API, а не из тела уведомления", async () => {
    const { o } = await paidOrder();
    gw.setRefunded("pay-1", 1635);

    await post(refundNotice({ amount: { value: "3270.00", currency: "RUB" } }));
    expect((await orderOf(o.id)).refundedAmount).toBe(1635);
  });

  it("телу не доверяем: ЮKassa не знает о возврате — заказ остаётся оплаченным, ничего не отправляется", async () => {
    const { o } = await paidOrder();

    expect((await post(refundNotice())).status).toBe(200);
    expect(await orderOf(o.id)).toMatchObject({ status: "paid", refundedAmount: 0 });
    expect((await journal()).map((r) => r.note)).toEqual(["refund.succeeded"]);
    await runAfter();
    expect(sendCancelled).not.toHaveBeenCalled();
    expect(notifyAlert).not.toHaveBeenCalled();
  });

  it.each(["cancelled", "done", "expired"] as const)("заказ уже %s (например, возврат сделал сам сайт) — только журнал", async (status) => {
    const { o } = await paidOrder({ status, refundedAmount: status === "cancelled" ? 3270 : 0 });
    gw.setRefunded("pay-1", 3270);

    expect((await post(refundNotice())).status).toBe(200);
    expect((await orderOf(o.id)).status).toBe(status);
    expect(await journal()).toHaveLength(1);
    await runAfter();
    expect(sendCancelled).not.toHaveBeenCalled();
    expect(notifyAlert).not.toHaveBeenCalled();
  });

  it("возврат из админки ещё идёт (заказ заблокирован): уведомление дожидается и видит отменённый заказ — второго письма нет", async () => {
    const { o } = await paidOrder();
    gw.setRefunded("pay-1", 3270);

    const res = await whileLocked(lockOrder(o.id), () => post(refundNotice()), async (tx) => {
      await tx.update(orders).set({ status: "cancelled", refundedAmount: 3270, refundId: "ref-1" }).where(eq(orders.id, o.id));
    });

    expect(res.status).toBe(200);
    expect(await orderOf(o.id)).toMatchObject({ status: "cancelled", refundedAmount: 3270, refundId: "ref-1" });
    await runAfter();
    expect(sendCancelled).not.toHaveBeenCalled();
  });
});

describe("refund.succeeded: не наш платёж и сбои", () => {
  it("платёж не наш → 200, в журнал ничего, шлюз не спрашиваем", async () => {
    await paidOrder();
    const getPayment = vi.spyOn(gw, "getPayment");

    expect((await post(refundNotice({ payment_id: "pay-unknown" }))).status).toBe(200);
    expect(await journal()).toHaveLength(0);
    expect(getPayment).not.toHaveBeenCalled();
    await runAfter();
    expect(notifyAlert).not.toHaveBeenCalled();
  });

  it("шлюз недоступен → 500 (ЮKassa повторит), ничего не записано; повтор отменяет заказ", async () => {
    const { o } = await paidOrder();
    gw.setRefunded("pay-1", 3270);
    gw.failNext("getPayment");

    expect((await post(refundNotice())).status).toBe(500);
    expect(await journal()).toHaveLength(0);
    expect((await orderOf(o.id)).status).toBe("paid");
    expect(state.after).toHaveLength(0);

    expect((await post(refundNotice())).status).toBe(200);
    expect((await orderOf(o.id)).status).toBe("cancelled");
    expect(await journal()).toHaveLength(1);
  });

  it.each([
    ["слишком длинный payment_id", refundNotice({ payment_id: "p".repeat(101) })],
    ["payment_id с недопустимыми символами", refundNotice({ payment_id: "pay-1' or 1=1" })],
    ["слишком длинное событие", { event: `refund.${"x".repeat(100)}`, object: { id: "r1", payment_id: "pay-1" } }],
    ["не JSON", "{"],
  ])("%s → 400, ничего не записано", async (_name, body) => {
    const { o } = await paidOrder();
    gw.setRefunded("pay-1", 3270);

    expect((await post(body)).status).toBe(400);
    expect(await journal()).toHaveLength(0);
    expect((await orderOf(o.id)).status).toBe("paid");
  });
});
