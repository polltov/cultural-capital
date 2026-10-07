import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, paymentEvents, tours, tourSessions } from "@/db/schema";
import { formatOrderNumber } from "@/lib/domain/order-number";
import { startCheckout } from "@/server/checkout";
import { runNightly } from "@/server/nightly";
import { sendCancelled, sendSorry, sendTicket } from "@/server/ticket";
import { notifyAlert, notifyPaidOrder } from "@/server/telegram";
import { fakeGateway, type FakeGateway } from "../support/fake-gateway";
import { lockOrder, whileLocked } from "../support/lock-gate";

vi.mock("@/server/ticket", () => ({ sendTicket: vi.fn(), sendSorry: vi.fn(), sendCancelled: vi.fn() }));
vi.mock("@/server/telegram", () => ({ notifyPaidOrder: vi.fn(), notifyAlert: vi.fn() }));

const H = 3600_000;
const valid = { children: 2, adults: 1, name: "Анна", phone: "8 (999) 123-45-67", email: "anna@example.com", consent: true, website: "" };
const ZERO = { synced: 0, expired: 0, closed: 0, done: 0, errors: 0 };

let gw: FakeGateway;
let ipSeq = 0;
let log: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  gw = fakeGateway();
  ipSeq = 0;
  vi.mocked(sendTicket).mockReset();
  vi.mocked(sendSorry).mockReset();
  vi.mocked(sendCancelled).mockReset();
  vi.mocked(notifyPaidOrder).mockReset();
  vi.mocked(notifyAlert).mockReset();
  log = vi.spyOn(console, "error").mockImplementation(() => {}); // сбои по заказам логируются
});
afterEach(() => {
  log.mockRestore();
  vi.unstubAllEnvs();
});

const run = (over: Parameters<typeof runNightly>[0] = {}) => runNightly({ db, gateway: gw, ...over });
const orderOf = async (id: number) => (await db.select().from(orders).where(eq(orders.id, id)))[0];
const journal = () => db.select().from(paymentEvents).orderBy(paymentEvents.id);

async function setup(over: { capacity?: number; startsAt?: Date } = {}) {
  const [t] = await db.insert(tours).values({ slug: "a", title: "Эрмитаж", durationLabel: "2 часа", ageLabel: "6+", priceChild: 1000, priceAdult: 1270, published: true }).returning();
  const [s] = await db
    .insert(tourSessions)
    .values({ tourId: t.id, startsAt: over.startsAt ?? new Date(Date.now() + 24 * H), capacity: over.capacity ?? 20 })
    .returning();
  return { t, s };
}

/** Заказ через startCheckout (платёж pay-N в подделке шлюза, статус pending), удержание сразу истекает. */
async function lapsed(sessionId: number) {
  const r = await startCheckout({ ...valid, sessionId }, `10.0.0.${++ipSeq}`, { db, gateway: gw });
  if (!r.ok) throw new Error(`startCheckout: ${JSON.stringify(r)}`);
  const [o] = await db.select().from(orders).where(eq(orders.accessToken, r.orderToken));
  await db.update(orders).set({ holdExpiresAt: new Date(Date.now() - 60_000) }).where(eq(orders.id, o.id));
  return { o, paymentId: o.paymentId! };
}

/** Оплаченный заказ на 2 детей + 1 взрослого (3270 ₽) со слепком цен 1000/1270; его платёж есть и в подделке шлюза. */
async function paidOrder(sessionId: number, over: Partial<typeof orders.$inferInsert> = {}) {
  const [o] = await db
    .insert(orders)
    .values({
      sessionId, customerName: "Анна", phone: "+79991234567", email: "anna@example.com", children: 2, adults: 1,
      priceChildSnapshot: 1000, priceAdultSnapshot: 1270, total: 3270, status: "paid", paymentId: `pay-${++ipSeq}`, paymentStatus: "succeeded",
      paidAt: new Date(), consentAt: new Date(), ...over,
    })
    .returning();
  if (o.paymentId) gw.addPayment(o.paymentId, { amount: o.total, orderId: o.id });
  return o;
}

describe("runNightly: the hold lapsed (awaiting_payment)", () => {
  it("a payment the webhook missed (succeeded at the gateway) → paid, ticket effects run", async () => {
    const { s } = await setup();
    const { o, paymentId } = await lapsed(s.id);
    gw.setStatus(paymentId, "succeeded");

    expect(await run()).toEqual({ ...ZERO, synced: 1 });
    expect(await orderOf(o.id)).toMatchObject({ status: "paid", paymentStatus: "succeeded" });
    expect((await orderOf(o.id)).paidAt).toBeInstanceOf(Date);
    expect((await journal()).map((r) => [r.source, r.note])).toEqual([["cron", "late_paid"]]);
    expect(sendTicket).toHaveBeenCalledWith(o.id, "paid");
    expect(notifyPaidOrder).toHaveBeenCalledWith(o.id);
  });

  it("seats taken meanwhile → the late payment is refunded and cancelled", async () => {
    const { s } = await setup({ capacity: 3 });
    const { o, paymentId } = await lapsed(s.id);
    await paidOrder(s.id, { children: 3, adults: 0, total: 3000 }); // занимает все 3 места
    gw.setStatus(paymentId, "succeeded");

    expect(await run()).toEqual({ ...ZERO, synced: 1 });
    expect(await orderOf(o.id)).toMatchObject({ status: "cancelled", refundedAmount: 3270 });
    expect(gw.refunds).toHaveLength(1);
    expect(sendSorry).toHaveBeenCalledWith(o.id);
  });

  it("not paid → expired (the payment is polled first)", async () => {
    const { s } = await setup();
    const { o } = await lapsed(s.id);

    expect(await run()).toEqual({ ...ZERO, synced: 1, expired: 1 });
    expect(await orderOf(o.id)).toMatchObject({ status: "expired", paymentStatus: "pending" });
    expect(sendTicket).not.toHaveBeenCalled();
  });

  it("an order without a payment id (the payment was never created) → expired without polling", async () => {
    const { s } = await setup();
    const o = await paidOrder(s.id, { status: "awaiting_payment", paymentId: null, paymentStatus: null, holdExpiresAt: new Date(Date.now() - 60_000) });
    const getPayment = vi.spyOn(gw, "getPayment");

    expect(await run()).toEqual({ ...ZERO, expired: 1 });
    expect((await orderOf(o.id)).status).toBe("expired");
    expect(getPayment).not.toHaveBeenCalled();
  });

  it("an active hold is left alone, and so is its payment", async () => {
    const { s } = await setup();
    const { o } = await lapsed(s.id);
    await db.update(orders).set({ holdExpiresAt: new Date(Date.now() + 10 * 60_000) }).where(eq(orders.id, o.id));
    const getPayment = vi.spyOn(gw, "getPayment");

    expect(await run()).toEqual(ZERO);
    expect((await orderOf(o.id)).status).toBe("awaiting_payment");
    expect(getPayment).not.toHaveBeenCalled();
  });

  it("a payment canceled at the gateway: the order ends up expired", async () => {
    const { s } = await setup();
    const { o, paymentId } = await lapsed(s.id);
    gw.setStatus(paymentId, "canceled");

    expect(await run()).toEqual({ ...ZERO, synced: 1 });
    expect((await orderOf(o.id)).status).toBe("expired");
  });

  it("the gateway is down: the order is NOT expired (the payment state is unknown), the error is counted, the rest go on", async () => {
    const { s } = await setup();
    const first = await lapsed(s.id);
    const second = await lapsed(s.id);
    gw.setStatus(second.paymentId, "succeeded");
    gw.failNext("getPayment"); // первый вызов (заказ first) упадёт

    expect(await run()).toEqual({ ...ZERO, synced: 1, errors: 1 });
    expect((await orderOf(first.o.id)).status).toBe("awaiting_payment");
    expect((await orderOf(second.o.id)).status).toBe("paid");
    expect(log).toHaveBeenCalled();
    expect(log.mock.calls.flat().map(String).join("\n")).not.toMatch(/anna@example\.com|КС-|access/i);

    // следующей ночью шлюз отвечает — заказ закрывается
    expect(await run()).toEqual({ ...ZERO, synced: 1, expired: 1 });
    expect((await orderOf(first.o.id)).status).toBe("expired");
  });

  it("a second run changes nothing", async () => {
    const { s } = await setup();
    await lapsed(s.id);
    await run();
    // заказ теперь `expired` с платежом `pending` — ни опроса, ни действий
    expect(await run()).toEqual(ZERO);
  });
});

describe("runNightly: expired orders left by a failed late refund", () => {
  /** Поздняя оплата без мест, автовозврат упал: заказ `expired`, платёж `succeeded`. */
  async function failedLateRefund() {
    const { s } = await setup({ capacity: 3 });
    const { o, paymentId } = await lapsed(s.id);
    await paidOrder(s.id, { children: 3, adults: 0, total: 3000 });
    gw.setStatus(paymentId, "succeeded");
    gw.failNext("createRefund");
    // первую попытку (она падает) делает сама ночная задача; повтор — отдельным запуском в тестах ниже
    expect(await run()).toEqual({ ...ZERO, synced: 1 });
    expect(await orderOf(o.id)).toMatchObject({ status: "expired", paymentStatus: "succeeded", refundedAmount: 0 });
    return { o, paymentId };
  }

  it("the nightly retry refunds it (same idempotence key) → cancelled", async () => {
    const { o, paymentId } = await failedLateRefund();
    expect(await run()).toEqual({ ...ZERO, synced: 1 });
    expect(await orderOf(o.id)).toMatchObject({ status: "cancelled", refundedAmount: 3270, refundId: "ref-1" });
    expect(gw.refunds).toHaveLength(1);
    expect(gw.refunds[0]).toMatchObject({ idempotenceKey: `late-refund-${o.id}`, paymentId, amount: 3270 });
    expect(sendSorry).toHaveBeenCalledWith(o.id);

    expect(await run()).toEqual(ZERO); // дальше заказ `cancelled` — ночная задача его не трогает
  });

  it("refunded by hand in the dashboard → cancelled as refunded_externally, no API refund", async () => {
    const { o, paymentId } = await failedLateRefund();
    gw.setRefunded(paymentId, 3270);

    expect(await run()).toEqual({ ...ZERO, synced: 1 });
    expect(await orderOf(o.id)).toMatchObject({ status: "cancelled", refundedAmount: 3270, refundId: null });
    expect(gw.refunds).toHaveLength(0);
    expect((await journal()).at(-1)?.note).toBe("refunded_externally");
  });

  it("the retry fails again: the order stays expired and is counted as synced, not as an error", async () => {
    const { o } = await failedLateRefund();
    gw.failNext("createRefund");
    expect(await run()).toEqual({ ...ZERO, synced: 1 });
    expect((await orderOf(o.id)).status).toBe("expired");
  });

  it("an expired order whose payment never succeeded is not polled", async () => {
    const { s } = await setup();
    const { o } = await lapsed(s.id);
    await run(); // → expired, payment_status pending
    const getPayment = vi.spyOn(gw, "getPayment");
    expect(await run()).toEqual(ZERO);
    expect((await orderOf(o.id)).status).toBe("expired");
    expect(getPayment).not.toHaveBeenCalled();
  });
});

describe("runNightly: after the excursion", () => {
  const past = (hours: number) => new Date(Date.now() - hours * H);

  it("closing on: one receipt «full payment» from the order snapshot, closing_receipt_at set, paid → done", async () => {
    const { t, s } = await setup({ startsAt: past(4) });
    const o = await paidOrder(s.id);
    await db.update(tours).set({ priceChild: 5000, priceAdult: 6000 }).where(eq(tours.id, t.id)); // цены после покупки не важны

    expect(await run({ closing: true })).toEqual({ ...ZERO, closed: 1, done: 1 });
    expect(gw.receipts).toHaveLength(1);
    expect(gw.receipts[0]).toMatchObject({ idempotenceKey: `closing-${o.id}`, paymentId: o.paymentId, customerEmail: "anna@example.com", prepaymentAmount: 3270 });
    expect(gw.receipts[0].items.map((i) => [i.quantity, i.amount.value, i.payment_mode, i.vat_code, i.payment_subject])).toEqual([
      [2, "1000.00", "full_payment", 1, "service"],
      [1, "1270.00", "full_payment", 1, "service"],
    ]);
    expect(gw.receipts[0].items[0].description).toMatch(/^Экскурсия «Эрмитаж», \d\d\.\d\d\.\d{4} \d\d:\d\d, детский билет$/);
    const after = await orderOf(o.id);
    expect(after.status).toBe("done");
    expect(after.closingReceiptAt).toBeInstanceOf(Date);
  });

  it("closing off: no receipt, paid → done, closing_receipt_at stays empty", async () => {
    const { s } = await setup({ startsAt: past(4) });
    const o = await paidOrder(s.id);

    expect(await run({ closing: false })).toEqual({ ...ZERO, done: 1 });
    expect(gw.receipts).toHaveLength(0);
    expect(await orderOf(o.id)).toMatchObject({ status: "done", closingReceiptAt: null });
  });

  it("closing defaults to RECEIPT_CLOSING (off unless «on»)", async () => {
    const { s } = await setup({ startsAt: past(4) });
    await paidOrder(s.id);
    await paidOrder(s.id);

    vi.stubEnv("RECEIPT_CLOSING", "");
    expect(await run()).toEqual({ ...ZERO, done: 2 });
    expect(gw.receipts).toHaveLength(0);

    await db.update(orders).set({ status: "paid" });
    vi.stubEnv("RECEIPT_CLOSING", "on");
    expect(await run()).toEqual({ ...ZERO, closed: 2, done: 2 });
    expect(gw.receipts).toHaveLength(2);
  });

  it("a done order marked by the admin gets the receipt too (closing on)", async () => {
    const { s } = await setup({ startsAt: past(4) });
    const o = await paidOrder(s.id, { status: "done" });

    expect(await run({ closing: true })).toEqual({ ...ZERO, closed: 1 });
    expect(gw.receipts).toHaveLength(1);
    expect(gw.receipts[0].idempotenceKey).toBe(`closing-${o.id}`);
    expect(await orderOf(o.id)).toMatchObject({ status: "done" });
    expect((await orderOf(o.id)).closingReceiptAt).toBeInstanceOf(Date);
  });

  it("a done order with closing off is not touched", async () => {
    const { s } = await setup({ startsAt: past(4) });
    const o = await paidOrder(s.id, { status: "done" });

    expect(await run({ closing: false })).toEqual(ZERO);
    expect(await orderOf(o.id)).toMatchObject({ status: "done", closingReceiptAt: null });
  });

  it("an old application without a payment id is not touched, even when done", async () => {
    const { s } = await setup({ startsAt: past(4) });
    const done = await paidOrder(s.id, { status: "done", paymentId: null, paymentStatus: null });
    const paid = await paidOrder(s.id, { status: "paid", paymentId: null, paymentStatus: null });

    expect(await run({ closing: true })).toEqual(ZERO);
    expect(gw.receipts).toHaveLength(0);
    expect((await orderOf(done.id)).closingReceiptAt).toBeNull();
    expect((await orderOf(paid.id)).status).toBe("paid");
  });

  it("only sessions that started more than 3 hours ago", async () => {
    const early = await setup({ startsAt: past(2.9) });
    const o = await paidOrder(early.s.id);
    expect(await run({ closing: true })).toEqual(ZERO);
    expect((await orderOf(o.id)).status).toBe("paid");

    expect(await run({ closing: true, now: new Date(Date.now() + 0.2 * H) })).toEqual({ ...ZERO, closed: 1, done: 1 });
    expect((await orderOf(o.id)).status).toBe("done");
  });

  it("orders that are not paid/done are not touched", async () => {
    const { s } = await setup({ startsAt: past(4) });
    const ids = [];
    for (const status of ["new", "confirmed", "cancelled", "expired"] as const) {
      ids.push((await paidOrder(s.id, { status, paymentStatus: status === "expired" ? "canceled" : "succeeded" })).id);
    }
    expect(await run({ closing: true })).toEqual(ZERO);
    expect(gw.receipts).toHaveLength(0);
    expect(await Promise.all(ids.map(async (id) => (await orderOf(id)).status))).toEqual(["new", "confirmed", "cancelled", "expired"]);
  });

  it("a receipt failure: errors counted, the order stays paid with no closing_receipt_at, the next one is processed", async () => {
    const { s } = await setup({ startsAt: past(4) });
    const first = await paidOrder(s.id);
    const second = await paidOrder(s.id);
    gw.failNext("createReceipt");

    expect(await run({ closing: true })).toEqual({ ...ZERO, closed: 1, done: 1, errors: 1 });
    expect(await orderOf(first.id)).toMatchObject({ status: "paid", closingReceiptAt: null });
    expect(await orderOf(second.id)).toMatchObject({ status: "done" });
    expect(gw.receipts.map((r) => r.idempotenceKey)).toEqual([`closing-${second.id}`]);
    expect(log.mock.calls.flat().map(String).join("\n")).not.toContain("anna@example.com");

    // следующей ночью — повтор с тем же ключом идемпотентности
    expect(await run({ closing: true })).toEqual({ ...ZERO, closed: 1, done: 1 });
    expect(gw.receipts.map((r) => r.idempotenceKey)).toEqual([`closing-${second.id}`, `closing-${first.id}`]);
    expect((await orderOf(first.id)).status).toBe("done");
  });

  it("a misconfigured VAT code (vatCode() throws): no receipt, error counted, order stays paid", async () => {
    const { s } = await setup({ startsAt: past(4) });
    const o = await paidOrder(s.id);
    vi.stubEnv("YOOKASSA_VAT_CODE", "abc");

    expect(await run({ closing: true })).toEqual({ ...ZERO, errors: 1 });
    expect(gw.receipts).toHaveLength(0);
    expect(await orderOf(o.id)).toMatchObject({ status: "paid", closingReceiptAt: null });
  });

  it("an order without an email cannot get a receipt: error counted, order stays paid", async () => {
    const { s } = await setup({ startsAt: past(4) });
    const o = await paidOrder(s.id, { email: null });

    expect(await run({ closing: true })).toEqual({ ...ZERO, errors: 1 });
    expect(gw.receipts).toHaveLength(0);
    expect((await orderOf(o.id)).status).toBe("paid");
  });

  it("a paid order that already has its receipt (done step failed last night) becomes done without a second receipt", async () => {
    const { s } = await setup({ startsAt: past(4) });
    const o = await paidOrder(s.id, { closingReceiptAt: new Date() });

    expect(await run({ closing: true })).toEqual({ ...ZERO, done: 1 });
    expect(gw.receipts).toHaveLength(0);
    expect((await orderOf(o.id)).status).toBe("done");
  });

  it("a second run does nothing", async () => {
    const { s } = await setup({ startsAt: past(4) });
    await paidOrder(s.id);
    await run({ closing: true });
    expect(await run({ closing: true })).toEqual(ZERO);
    expect(gw.receipts).toHaveLength(1);
  });

  it("closing on without a configured gateway: every order is an error, none is lost", async () => {
    const { s } = await setup({ startsAt: past(4) });
    const o = await paidOrder(s.id);
    vi.stubEnv("YOOKASSA_SHOP_ID", "");
    vi.stubEnv("YOOKASSA_SECRET_KEY", "");

    expect(await runNightly({ db, closing: true })).toEqual({ ...ZERO, errors: 1 });
    expect((await orderOf(o.id)).status).toBe("paid");
  });
});

describe("runNightly: the payment was refunded outside the site before the closing receipt", () => {
  const past = (hours: number) => new Date(Date.now() - hours * H);

  it("a paid order refunded in the dashboard: no receipt, cancelled with the refunded amount, one alert", async () => {
    const { s } = await setup({ startsAt: past(4) });
    const o = await paidOrder(s.id);
    gw.setRefunded(o.paymentId!, 3270);

    expect(await run({ closing: true })).toEqual(ZERO);
    expect(gw.receipts).toHaveLength(0);
    expect(await orderOf(o.id)).toMatchObject({ status: "cancelled", refundedAmount: 3270, closingReceiptAt: null });
    expect(notifyAlert).toHaveBeenCalledExactlyOnceWith(
      `Возврат по заказу ${formatOrderNumber(o.number)} оформлен в кабинете ЮKassa — на сайте заказ отменён автоматически`,
    );
    expect((await journal()).map((r) => [r.source, r.orderId, r.note])).toEqual([["cron", o.id, "closing_skipped_refunded"]]);

    // отменённый заказ из выборки уходит: ни чека, ни второй тревоги
    expect(await run({ closing: true })).toEqual(ZERO);
    expect(notifyAlert).toHaveBeenCalledTimes(1);
  });

  it("a done order refunded in the dashboard: no receipt, stays done, one alert; later runs skip it without asking YooKassa", async () => {
    const { s } = await setup({ startsAt: past(4) });
    const o = await paidOrder(s.id, { status: "done" });
    gw.setRefunded(o.paymentId!, 1635);

    expect(await run({ closing: true })).toEqual(ZERO);
    expect(gw.receipts).toHaveLength(0);
    expect(await orderOf(o.id)).toMatchObject({ status: "done", refundedAmount: 0, closingReceiptAt: null });
    expect(notifyAlert).toHaveBeenCalledExactlyOnceWith(
      `Возврат по заказу ${formatOrderNumber(o.number)} оформлен в кабинете ЮKassa — закрывающий чек по нему не выбит`,
    );
    expect((await journal()).map((r) => [r.source, r.orderId, r.note])).toEqual([["cron", o.id, "closing_skipped_refunded"]]);

    const getPayment = vi.spyOn(gw, "getPayment");
    expect(await run({ closing: true })).toEqual(ZERO);
    expect(getPayment).not.toHaveBeenCalled();
    expect(gw.receipts).toHaveLength(0);
    expect(notifyAlert).toHaveBeenCalledTimes(1);
    expect(await journal()).toHaveLength(1);
  });

  it("not refunded: the receipt goes out as usual, nothing is journalled", async () => {
    const { s } = await setup({ startsAt: past(4) });
    const o = await paidOrder(s.id);
    const getPayment = vi.spyOn(gw, "getPayment");

    expect(await run({ closing: true })).toEqual({ ...ZERO, closed: 1, done: 1 });
    expect(getPayment).toHaveBeenCalledExactlyOnceWith(o.paymentId);
    expect(await journal()).toHaveLength(0);
    expect(notifyAlert).not.toHaveBeenCalled();
  });

  it("closing off: YooKassa is not asked, paid → done as before", async () => {
    const { s } = await setup({ startsAt: past(4) });
    const o = await paidOrder(s.id);
    gw.setRefunded(o.paymentId!, 3270);
    const getPayment = vi.spyOn(gw, "getPayment");

    expect(await run({ closing: false })).toEqual({ ...ZERO, done: 1 });
    expect(getPayment).not.toHaveBeenCalled();
    expect((await orderOf(o.id)).status).toBe("done");
  });

  it("YooKassa cannot be asked before the receipt: error counted, no receipt, the order stays paid", async () => {
    const { s } = await setup({ startsAt: past(4) });
    const o = await paidOrder(s.id);
    gw.failNext("getPayment");

    expect(await run({ closing: true })).toEqual({ ...ZERO, errors: 1 });
    expect(gw.receipts).toHaveLength(0);
    expect(await orderOf(o.id)).toMatchObject({ status: "paid", closingReceiptAt: null });
  });
});

describe("runNightly: the order changes after the nightly run selected it", () => {
  const past = (hours: number) => new Date(Date.now() - hours * H);

  /** Ночная задача выбрала заказ, и до её блокировки заказа его меняют (админка): правка видна задаче только под блокировкой. */
  const changedMeanwhile = (orderId: number, change: (tx: Parameters<NonNullable<Parameters<typeof whileLocked>[2]>>[0]) => Promise<void>, closing: boolean) =>
    whileLocked(lockOrder(orderId), () => run({ closing }), change);

  it.each([true, false])("refunded (cancelled) meanwhile: no receipt, not marked done (closing %s)", async (closing) => {
    const { s } = await setup({ startsAt: past(4) });
    const o = await paidOrder(s.id);

    const report = await changedMeanwhile(o.id, async (tx) => {
      await tx.update(orders).set({ status: "cancelled", refundedAmount: 3270, refundId: "ref-x" }).where(eq(orders.id, o.id));
    }, closing);

    expect(report).toEqual(ZERO);
    expect(gw.receipts).toHaveLength(0);
    expect(await orderOf(o.id)).toMatchObject({ status: "cancelled", closingReceiptAt: null, refundedAmount: 3270 });
  });

  it.each([true, false])("moved to a future session meanwhile: no receipt, not marked done (closing %s)", async (closing) => {
    const { t, s } = await setup({ startsAt: past(4) });
    const [future] = await db.insert(tourSessions).values({ tourId: t.id, startsAt: new Date(Date.now() + 48 * H), capacity: 20 }).returning();
    const o = await paidOrder(s.id);

    const report = await changedMeanwhile(o.id, async (tx) => {
      await tx.update(orders).set({ sessionId: future.id }).where(eq(orders.id, o.id));
    }, closing);

    expect(report).toEqual(ZERO);
    expect(gw.receipts).toHaveLength(0);
    expect(await orderOf(o.id)).toMatchObject({ status: "paid", sessionId: future.id, closingReceiptAt: null });
  });

  it("the session itself was rescheduled to the future meanwhile: no receipt, not marked done", async () => {
    const { s } = await setup({ startsAt: past(4) });
    const o = await paidOrder(s.id);

    const report = await changedMeanwhile(o.id, async (tx) => {
      await tx.update(tourSessions).set({ startsAt: new Date(Date.now() + 48 * H) }).where(eq(tourSessions.id, s.id));
    }, true);

    expect(report).toEqual(ZERO);
    expect(gw.receipts).toHaveLength(0);
    expect(await orderOf(o.id)).toMatchObject({ status: "paid", closingReceiptAt: null });
  });

  it("moved to another session that is also over: skipped this run (the pick is stale), the next run uses the NEW session date", async () => {
    const { t, s } = await setup({ startsAt: past(4) });
    const newStart = past(30);
    const [other] = await db.insert(tourSessions).values({ tourId: t.id, startsAt: newStart, capacity: 20 }).returning();
    const o = await paidOrder(s.id);

    // Новый сеанс тоже прошёл, но выборка помнила прежний: заказ пропускаем, а чек выбьет следующий запуск — уже с датой нового сеанса.
    const report = await changedMeanwhile(o.id, async (tx) => {
      await tx.update(orders).set({ sessionId: other.id }).where(eq(orders.id, o.id));
    }, true);
    expect(report).toEqual(ZERO);
    expect(gw.receipts).toHaveLength(0);

    expect(await run({ closing: true })).toEqual({ ...ZERO, closed: 1, done: 1 });
    expect(gw.receipts).toHaveLength(1);
    expect(gw.receipts[0].items[0].description).toContain(newStart.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" }));
  });

  it("the receipt was issued meanwhile (closing_receipt_at set): no second receipt, the order is just marked done", async () => {
    const { s } = await setup({ startsAt: past(4) });
    const o = await paidOrder(s.id);

    const report = await changedMeanwhile(o.id, async (tx) => {
      await tx.update(orders).set({ closingReceiptAt: new Date() }).where(eq(orders.id, o.id));
    }, true);

    expect(report).toEqual({ ...ZERO, done: 1 });
    expect(gw.receipts).toHaveLength(0);
    expect((await orderOf(o.id)).status).toBe("done");
  });

  it("marked done by the admin meanwhile: it still gets its receipt, and is not counted as done by the nightly run", async () => {
    const { s } = await setup({ startsAt: past(4) });
    const o = await paidOrder(s.id);

    const report = await changedMeanwhile(o.id, async (tx) => {
      await tx.update(orders).set({ status: "done" }).where(eq(orders.id, o.id));
    }, true);

    expect(report).toEqual({ ...ZERO, closed: 1 });
    expect(gw.receipts).toHaveLength(1);
    expect(await orderOf(o.id)).toMatchObject({ status: "done" });
    expect((await orderOf(o.id)).closingReceiptAt).toBeInstanceOf(Date);
  });
});

describe("runNightly: the receipt is issued but cannot be recorded", () => {
  const past = (hours: number) => new Date(Date.now() - hours * H);
  const logged = () => log.mock.calls.flat().map(String).join("\n");

  afterEach(async () => {
    await db.execute(sql`drop trigger if exists nightly_test_no_mark on orders`);
    await db.execute(sql`drop function if exists nightly_test_no_mark()`);
  });

  it("is logged distinctly from a receipt failure; the order stays paid, the retry reuses the same key", async () => {
    const { s } = await setup({ startsAt: past(4) });
    const o = await paidOrder(s.id);
    // Отметка о чеке не записывается (имитация сбоя БД после ответа ЮKassa); чек при этом уже выбит.
    await db.execute(sql`create function nightly_test_no_mark() returns trigger language plpgsql as $$ begin raise exception 'отметка не записывается'; end $$`);
    await db.execute(sql`create trigger nightly_test_no_mark before update on orders for each row when (new.closing_receipt_at is not null and old.closing_receipt_at is null) execute function nightly_test_no_mark()`);

    expect(await run({ closing: true })).toEqual({ ...ZERO, errors: 1 });
    expect(gw.receipts).toHaveLength(1);
    expect(await orderOf(o.id)).toMatchObject({ status: "paid", closingReceiptAt: null });
    expect(logged()).toContain("чек выбит");
    expect(logged()).not.toContain("anna@example.com");

    await db.execute(sql`drop trigger nightly_test_no_mark on orders`);
    expect(await run({ closing: true })).toEqual({ ...ZERO, closed: 1, done: 1 });
    expect(gw.receipts.map((r) => r.idempotenceKey)).toEqual([`closing-${o.id}`, `closing-${o.id}`]);
  });

  it("a receipt that failed is not reported as issued", async () => {
    const { s } = await setup({ startsAt: past(4) });
    await paidOrder(s.id);
    gw.failNext("createReceipt");

    expect(await run({ closing: true })).toEqual({ ...ZERO, errors: 1 });
    expect(logged()).not.toContain("чек выбит");
  });
});
