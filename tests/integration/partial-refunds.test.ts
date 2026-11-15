import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orderRefunds, orders, tours, tourSessions } from "@/db/schema";
import { occupiedSeats } from "@/server/orders";
import { syncRefund } from "@/server/payment-sync";
import { cancelTickets, listRefunds, refundOrder } from "@/server/refunds";
import { runNightly } from "@/server/nightly";
import { notifyAlert } from "@/server/telegram";
import { formatRub } from "@/lib/domain/pricing";
import { fakeGateway, type FakeGateway } from "../support/fake-gateway";

vi.mock("@/server/telegram", () => ({ notifyPaidOrder: vi.fn(), notifyAlert: vi.fn() }));
vi.mock("@/server/ticket", () => ({ sendTicket: vi.fn(), sendSorry: vi.fn(), sendCancelled: vi.fn() }));

const H = 3600_000;
let gw: FakeGateway;
beforeEach(() => {
  gw = fakeGateway();
  vi.mocked(notifyAlert).mockReset();
});

/** Оплаченный заказ: 2 детских по 1000 + 1 взрослый за 1270 = 3270 ₽, платёж есть в подделке шлюза. */
async function paid(startsAt = new Date(Date.now() + 48 * H)) {
  const [t] = await db.insert(tours).values({ slug: "a", title: "Эрмитаж", durationLabel: "2 часа", ageLabel: "6+", priceChild: 1000, priceAdult: 1270, published: true }).returning();
  const [s] = await db.insert(tourSessions).values({ tourId: t.id, startsAt, capacity: 8 }).returning();
  const [o] = await db
    .insert(orders)
    .values({
      sessionId: s.id, customerName: "Анна", phone: "+79991234567", email: "anna@example.com", children: 2, adults: 1,
      priceChildSnapshot: 1000, priceAdultSnapshot: 1270, total: 3270, status: "paid", paymentId: "pay-1", paymentStatus: "succeeded",
      paidAt: new Date(), consentAt: new Date(), accessToken: "t".repeat(43),
    })
    .returning();
  gw.addPayment("pay-1", { amount: 3270, orderId: o.id });
  return { o, s };
}
const orderOf = async (id: number) => (await db.select().from(orders).where(eq(orders.id, id)))[0];
const deps = () => ({ db, gateway: gw });

describe("cancelTickets", () => {
  it("отменяет часть билетов: возврат с чеком, места освобождаются, остальное действует, история пишется", async () => {
    const { o, s } = await paid();
    expect(await occupiedSeats(db, s.id)).toBe(3);

    expect(await cancelTickets(o.id, { children: 1, adults: 0 }, 1000, deps())).toEqual({ ok: true });
    expect(gw.refunds).toHaveLength(1);
    expect(gw.refunds[0]).toMatchObject({ idempotenceKey: `refund-${o.id}`, paymentId: "pay-1", amount: 1000, customerEmail: "anna@example.com" });
    expect(gw.refunds[0].items[0].amount.value).toBe("1000.00");

    const after = await orderOf(o.id);
    expect(after).toMatchObject({ status: "paid", children: 1, adults: 1, total: 3270, refundedAmount: 1000, refundId: "ref-1" });
    expect(await occupiedSeats(db, s.id)).toBe(2);
    expect(await listRefunds(o.id, db)).toMatchObject([{ amount: 1000, children: 1, adults: 0, source: "admin" }]);
  });

  it("несколько отмен подряд и затем полная: у каждого возврата свой ключ, сумма копится, лишнего не вернуть", async () => {
    const { o } = await paid();
    expect(await cancelTickets(o.id, { children: 1, adults: 0 }, 500, deps())).toEqual({ ok: true });
    expect(await cancelTickets(o.id, { children: 1, adults: 0 }, 1000, deps())).toEqual({ ok: true });
    expect(await orderOf(o.id)).toMatchObject({ status: "paid", children: 0, adults: 1, refundedAmount: 1500 });

    // Остаток к возврату — 3270 − 1500 = 1770; больше не даёт
    expect(await refundOrder(o.id, 1771, deps())).toEqual({ ok: false, error: `Сумма возврата — от 0 до ${formatRub(1770)}` });
    expect(await refundOrder(o.id, 1270, deps())).toEqual({ ok: true });

    expect(gw.refunds.map((r) => r.idempotenceKey)).toEqual([`refund-${o.id}`, `refund-${o.id}-2`, `refund-${o.id}-3`]);
    expect(await orderOf(o.id)).toMatchObject({ status: "cancelled", refundedAmount: 2770 });
    expect((await listRefunds(o.id, db)).map((r) => [r.amount, r.children, r.adults])).toEqual([[500, 1, 0], [1000, 1, 0], [1270, 0, 1]]);
  });

  it("проверки: не оплачен, ни одного или все билеты, больше чем есть, сумма больше стоимости отменяемых", async () => {
    const { o } = await paid();
    expect(await cancelTickets(o.id, { children: 0, adults: 0 }, 0, deps())).toMatchObject({ ok: false });
    expect(await cancelTickets(o.id, { children: 3, adults: 0 }, 0, deps())).toMatchObject({ ok: false });
    expect(await cancelTickets(o.id, { children: 2, adults: 1 }, 0, deps())).toEqual({ ok: false, error: "Это все билеты заказа — используйте «Отменить и вернуть»" });
    expect(await cancelTickets(o.id, { children: 1, adults: 0 }, 1001, deps())).toEqual({ ok: false, error: `Сумма возврата — от 0 до ${formatRub(1000)}` });
    expect(await cancelTickets(o.id, { children: -1, adults: 1 }, 0, deps())).toMatchObject({ ok: false });
    expect(gw.refunds).toHaveLength(0);
    expect(await orderOf(o.id)).toMatchObject({ children: 2, adults: 1, refundedAmount: 0 });

    await db.update(orders).set({ status: "cancelled" }).where(eq(orders.id, o.id));
    expect(await cancelTickets(o.id, { children: 1, adults: 0 }, 0, deps())).toEqual({ ok: false, error: "Отменить билеты можно только в оплаченном заказе" });
  });

  it("без возврата (0 ₽) — шлюз не вызывается, билеты отменяются", async () => {
    const { o } = await paid();
    expect(await cancelTickets(o.id, { children: 0, adults: 1 }, 0, deps())).toEqual({ ok: true });
    expect(gw.refunds).toHaveLength(0);
    expect(await orderOf(o.id)).toMatchObject({ children: 2, adults: 0, refundedAmount: 0 });
  });

  it("сбой ЮKassa — заказ не меняется, истории нет", async () => {
    const { o } = await paid();
    gw.failNext("createRefund");
    const r = await cancelTickets(o.id, { children: 1, adults: 0 }, 1000, deps());
    expect(r.ok).toBe(false);
    expect(await orderOf(o.id)).toMatchObject({ children: 2, adults: 1, refundedAmount: 0 });
    expect(await db.select().from(orderRefunds)).toEqual([]);
  });

  it("в кабинете ЮKassa уже вернули больше, чем знает сайт, — заказ отменяется целиком, нового возврата нет", async () => {
    const { o } = await paid();
    gw.setRefunded("pay-1", 3270);
    const r = await cancelTickets(o.id, { children: 1, adults: 0 }, 1000, deps());
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("кабинете ЮKassa") });
    expect(gw.refunds).toHaveLength(0);
    expect(await orderOf(o.id)).toMatchObject({ status: "cancelled", refundedAmount: 3270 });
    expect(await listRefunds(o.id, db)).toMatchObject([{ amount: 3270, source: "external" }]);
  });
});

describe("сверка с ЮKassa после частичной отмены", () => {
  it("уведомление refund.succeeded о возврате самого сайта — заказ остаётся оплаченным", async () => {
    const { o } = await paid();
    await cancelTickets(o.id, { children: 1, adults: 0 }, 1000, deps());
    const outcome = await syncRefund({ id: "ref-1", payment_id: "pay-1", status: "succeeded", amount: { value: "1000.00", currency: "RUB" } }, deps());
    expect(outcome).toEqual({ kind: "noop", orderId: o.id });
    expect(await orderOf(o.id)).toMatchObject({ status: "paid", refundedAmount: 1000 });
  });

  it("а возврат сверх известного сайту (из кабинета) — отменяет заказ", async () => {
    const { o } = await paid();
    await cancelTickets(o.id, { children: 1, adults: 0 }, 1000, deps());
    gw.setRefunded("pay-1", 2000);
    const outcome = await syncRefund({ id: "ref-x", payment_id: "pay-1", status: "succeeded", amount: { value: "1000.00", currency: "RUB" } }, deps());
    expect(outcome).toEqual({ kind: "refunded_externally", orderId: o.id });
    expect(await orderOf(o.id)).toMatchObject({ status: "cancelled", refundedAmount: 2000 });
    expect((await listRefunds(o.id, db)).at(-1)).toMatchObject({ amount: 1000, source: "external" });
  });

  it("ночью с закрывающими чеками: заказ с частичной отменой проводится, чек не выбивается, владельцу — тревога", async () => {
    const { o } = await paid(new Date(Date.now() - 5 * H));
    await cancelTickets(o.id, { children: 1, adults: 0 }, 1000, deps());
    const report = await runNightly({ db, gateway: gw, closing: true });
    expect(report).toMatchObject({ closed: 0, errors: 0 });
    expect(gw.receipts).toHaveLength(0);
    expect(await orderOf(o.id)).toMatchObject({ status: "done", closingReceiptAt: null, refundedAmount: 1000 });
    expect(notifyAlert).toHaveBeenCalledWith(expect.stringContaining("отменена часть билетов"));

    // Следующей ночью — молча
    vi.mocked(notifyAlert).mockReset();
    await runNightly({ db, gateway: gw, closing: true });
    expect(notifyAlert).not.toHaveBeenCalled();
  });
});
