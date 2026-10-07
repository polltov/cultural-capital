import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, paymentEvents, tours, tourSessions } from "@/db/schema";
import { formatOrderNumber } from "@/lib/domain/order-number";
import { releaseHold, startCheckout } from "@/server/checkout";
import { recordPaymentEvent, runSyncEffects, syncPayment, type SyncOutcome } from "@/server/payment-sync";
import { sendCancelled, sendSorry, sendTicket } from "@/server/ticket";
import { notifyAlert, notifyPaidOrder } from "@/server/telegram";
import { fakeGateway, type FakeGateway } from "../support/fake-gateway";
import { lockSession, whileLocked } from "../support/lock-gate";

vi.mock("@/server/ticket", () => ({ sendTicket: vi.fn(), sendSorry: vi.fn(), sendCancelled: vi.fn() }));
vi.mock("@/server/telegram", () => ({ notifyPaidOrder: vi.fn(), notifyAlert: vi.fn() }));

const H = 3600_000;
const valid = { children: 2, adults: 1, name: "Анна", phone: "8 (999) 123-45-67", email: "anna@example.com", consent: true, website: "" };

let gw: FakeGateway;
let ipSeq = 0;

beforeEach(() => {
  gw = fakeGateway();
  ipSeq = 0;
  vi.mocked(sendTicket).mockReset();
  vi.mocked(sendSorry).mockReset();
  vi.mocked(sendCancelled).mockReset();
  vi.mocked(notifyPaidOrder).mockReset();
  vi.mocked(notifyAlert).mockReset();
});
afterEach(() => vi.unstubAllEnvs());

async function setup(capacity = 8) {
  const [t] = await db.insert(tours).values({ slug: "a", title: "Эрмитаж", durationLabel: "2 часа", ageLabel: "6+", priceChild: 1000, priceAdult: 1270, published: true }).returning();
  const [s] = await db.insert(tourSessions).values({ tourId: t.id, startsAt: new Date(Date.now() + 24 * H), capacity }).returning();
  return { t, s };
}

/** Заказ через startCheckout (платёж pay-N в подделке шлюза, статус pending). */
async function buy(sessionId: number, over: Record<string, unknown> = {}) {
  const r = await startCheckout({ ...valid, sessionId, ...over }, `10.0.0.${++ipSeq}`, { db, gateway: gw });
  if (!r.ok) throw new Error(`startCheckout: ${JSON.stringify(r)}`);
  const [o] = await db.select().from(orders).where(eq(orders.accessToken, r.orderToken));
  return { o, token: r.orderToken, paymentId: o.paymentId! };
}

/** Занять `n` мест чужим оплаченным заказом. */
async function occupy(sessionId: number, n: number): Promise<number> {
  const [r] = await db
    .insert(orders)
    .values({ sessionId, customerName: "X", phone: "+7", priceChildSnapshot: 1, priceAdultSnapshot: 1, total: 1, consentAt: new Date(), children: n, adults: 0, status: "paid" })
    .returning({ id: orders.id });
  return r.id;
}

const sync = (paymentId: string, source: "webhook" | "sync" | "cron" = "webhook") => syncPayment(paymentId, source, { db, gateway: gw });
const orderOf = async (id: number) => (await db.select().from(orders).where(eq(orders.id, id)))[0];
const journal = () => db.select().from(paymentEvents).orderBy(paymentEvents.id);

/**
 * Два синка одного платежа одновременно. Блокировку сеанса держим снаружи, пока оба дойдут до своих транзакций:
 * без `FOR UPDATE` оба прочитали бы старый статус заказа.
 */
async function syncTwice(sessionId: number, paymentId: string): Promise<SyncOutcome["kind"][]> {
  const both = await whileLocked(lockSession(sessionId), () => Promise.all([sync(paymentId), sync(paymentId, "sync")]));
  return both.map((r) => r.kind).sort();
}

describe("syncPayment: succeeded", () => {
  it("awaiting_payment → paid, paidAt set, one journal row; a repeat is a noop with a second journal row", async () => {
    const { s } = await setup();
    const { o, paymentId } = await buy(s.id);
    gw.setStatus(paymentId, "succeeded");

    const before = Date.now();
    expect(await sync(paymentId)).toEqual({ kind: "paid", orderId: o.id });
    const paid = await orderOf(o.id);
    expect(paid.status).toBe("paid");
    expect(paid.paymentStatus).toBe("succeeded");
    expect(paid.paidAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(paid.paidAt!.getTime()).toBeLessThanOrEqual(Date.now() + 1000);

    const rows = await journal();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: "webhook", event: "payment.succeeded", paymentId, orderId: o.id, note: "paid" });
    expect(rows[0].payload).toMatchObject({ id: paymentId, status: "succeeded", amount: { value: "3270.00", currency: "RUB" }, metadata: { order_id: String(o.id) } });

    expect(await sync(paymentId, "sync")).toEqual({ kind: "noop", orderId: o.id });
    const rows2 = await journal();
    expect(rows2).toHaveLength(2);
    expect(rows2[1]).toMatchObject({ source: "sync", event: "payment.succeeded", orderId: o.id, note: "noop" });
    expect((await orderOf(o.id)).paidAt).toEqual(paid.paidAt);
  });

  it("the journal keeps the whole API response, with the widget confirmation token blanked", async () => {
    const { s } = await setup();
    const { o, paymentId } = await buy(s.id);
    await sync(paymentId);
    const payload = (await journal())[0].payload;
    expect(payload).toEqual({
      id: paymentId, status: "pending", amount: { value: "3270.00", currency: "RUB" }, metadata: { order_id: String(o.id) },
      confirmation: { type: "embedded", confirmation_token: null },
    });
    expect(JSON.stringify(payload)).not.toContain("ct-1");
  });

  it("an admin changing tour prices after checkout does not matter: total is the snapshot", async () => {
    const { t, s } = await setup();
    const { o, paymentId } = await buy(s.id);
    await db.update(tours).set({ priceChild: 5000 }).where(eq(tours.id, t.id));
    gw.setStatus(paymentId, "succeeded");
    expect(await sync(paymentId)).toEqual({ kind: "paid", orderId: o.id });
    expect((await orderOf(o.id)).status).toBe("paid");
  });

  it("an order whose payment_id was cleared is found by metadata.order_id and gets payment_id back", async () => {
    const { s } = await setup();
    const { o, paymentId } = await buy(s.id);
    await db.update(orders).set({ paymentId: null, paymentStatus: null }).where(eq(orders.id, o.id));
    gw.setStatus(paymentId, "succeeded");
    expect(await sync(paymentId)).toEqual({ kind: "paid", orderId: o.id });
    expect(await orderOf(o.id)).toMatchObject({ status: "paid", paymentId, paymentStatus: "succeeded" });
  });

  it("an awaiting_payment order with an active hold is paid without a seat check", async () => {
    const { s } = await setup(3);
    const { o, paymentId } = await buy(s.id);
    // удержание активно: заказ сам занимает все 3 места, проверка свободных мест ему не нужна (и дала бы отказ)
    gw.setStatus(paymentId, "succeeded");
    expect(await sync(paymentId, "cron")).toEqual({ kind: "paid", orderId: o.id });
    expect(gw.refunds).toHaveLength(0);
  });

  it("amount mismatch: status unchanged, outcome mismatch, journalled", async () => {
    const { s } = await setup();
    const { o, paymentId } = await buy(s.id);
    gw.setStatus(paymentId, "succeeded");
    gw.payments.get(paymentId)!.amount = { value: "100.00", currency: "RUB" };

    expect(await sync(paymentId)).toEqual({ kind: "mismatch", orderId: o.id });
    expect(await orderOf(o.id)).toMatchObject({ status: "awaiting_payment", paidAt: null, paymentStatus: "succeeded" });
    const rows = await journal();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ event: "payment.succeeded", orderId: o.id, note: "mismatch" });
  });

  it("currency mismatch is a mismatch too", async () => {
    const { s } = await setup();
    const { o, paymentId } = await buy(s.id);
    gw.setStatus(paymentId, "succeeded");
    gw.payments.get(paymentId)!.amount = { value: "3270.00", currency: "USD" };
    expect(await sync(paymentId)).toEqual({ kind: "mismatch", orderId: o.id });
    expect((await orderOf(o.id)).status).toBe("awaiting_payment");
  });

  it("a mismatched payment raises «mismatch» (the alert) only the first time; repeats are noop but journalled", async () => {
    const { s } = await setup();
    const { o, paymentId } = await buy(s.id);
    gw.setStatus(paymentId, "succeeded");
    gw.payments.get(paymentId)!.amount = { value: "100.00", currency: "RUB" };

    expect(await sync(paymentId)).toEqual({ kind: "mismatch", orderId: o.id });
    expect(await sync(paymentId, "sync")).toEqual({ kind: "noop", orderId: o.id });
    expect(await sync(paymentId, "cron")).toEqual({ kind: "noop", orderId: o.id });
    expect((await orderOf(o.id)).status).toBe("awaiting_payment");
    expect((await journal()).map((r) => [r.source, r.note])).toEqual([["webhook", "mismatch"], ["sync", "noop"], ["cron", "noop"]]);
  });

  it.each(["paid", "done", "cancelled"] as const)("an order that is already %s is left alone (noop)", async (status) => {
    const { s } = await setup();
    const { o, paymentId } = await buy(s.id);
    await db.update(orders).set({ status, paymentStatus: "succeeded" }).where(eq(orders.id, o.id));
    gw.setStatus(paymentId, "succeeded");
    expect(await sync(paymentId)).toEqual({ kind: "noop", orderId: o.id });
    const after = await orderOf(o.id);
    expect(after).toMatchObject({ status, paidAt: null, refundedAmount: 0, refundId: null });
    expect(gw.refunds).toHaveLength(0);
  });

  it("two parallel syncs of one payment: exactly one transition", async () => {
    const { s } = await setup();
    const { o, paymentId } = await buy(s.id);
    gw.setStatus(paymentId, "succeeded");
    expect(await syncTwice(s.id, paymentId)).toEqual(["noop", "paid"]);
    expect((await orderOf(o.id)).status).toBe("paid");
    expect(await journal()).toHaveLength(2);
  });
});

describe("syncPayment: late payment (order is expired)", () => {
  it("seats are free → paid (late_paid)", async () => {
    const { s } = await setup();
    const { o, token, paymentId } = await buy(s.id);
    await releaseHold(token, db);
    gw.setStatus(paymentId, "succeeded");

    expect(await sync(paymentId)).toEqual({ kind: "late_paid", orderId: o.id });
    const after = await orderOf(o.id);
    expect(after.status).toBe("paid");
    expect(after.paidAt).toBeInstanceOf(Date);
    expect(gw.refunds).toHaveLength(0);
    expect((await journal())[0].note).toBe("late_paid");
  });

  it("exactly as many free seats as participants is still late_paid", async () => {
    const { s } = await setup(8);
    const { o, token, paymentId } = await buy(s.id);
    await releaseHold(token, db);
    await occupy(s.id, 5);
    gw.setStatus(paymentId, "succeeded");
    expect(await sync(paymentId)).toEqual({ kind: "late_paid", orderId: o.id });
  });

  it("one seat short → full auto-refund, cancelled (late_refunded)", async () => {
    const { s } = await setup(8);
    const { o, token, paymentId } = await buy(s.id);
    await releaseHold(token, db);
    await occupy(s.id, 6);
    gw.setStatus(paymentId, "succeeded");

    expect(await sync(paymentId)).toEqual({ kind: "late_refunded", orderId: o.id });
    expect(await orderOf(o.id)).toMatchObject({ status: "cancelled", refundedAmount: 3270, refundId: "ref-1", paymentStatus: "succeeded", paidAt: null });
    expect(gw.refunds).toHaveLength(1);
    expect(gw.refunds[0]).toMatchObject({ idempotenceKey: `late-refund-${o.id}`, paymentId, amount: 3270, customerEmail: "anna@example.com" });
    expect(gw.refunds[0].items).toHaveLength(1);
    expect(gw.refunds[0].items[0]).toMatchObject({ quantity: 1, amount: { value: "3270.00", currency: "RUB" }, vat_code: 1 });
    expect(gw.refunds[0].items[0].description).toMatch(/^Возврат: Экскурсия «Эрмитаж», \d\d\.\d\d\.\d{4} \d\d:\d\d$/);
    expect((await journal())[0].note).toBe("late_refunded");
  });

  it("two parallel syncs of a refused late payment refund once", async () => {
    const { s } = await setup(8);
    const { o, token, paymentId } = await buy(s.id);
    await releaseHold(token, db);
    await occupy(s.id, 8);
    gw.setStatus(paymentId, "succeeded");
    expect(await syncTwice(s.id, paymentId)).toEqual(["late_refunded", "noop"]);
    expect(gw.refunds).toHaveLength(1);
    expect((await orderOf(o.id)).status).toBe("cancelled");
  });

  async function lapsedHold(capacity: number, occupied: number) {
    const { s } = await setup(capacity);
    const { o, paymentId } = await buy(s.id);
    await db.update(orders).set({ holdExpiresAt: new Date(Date.now() - 60_000) }).where(eq(orders.id, o.id));
    if (occupied > 0) await occupy(s.id, occupied);
    gw.setStatus(paymentId, "succeeded");
    return { o, paymentId };
  }

  it("a lapsed hold (still awaiting_payment) with the seats still free → late_paid", async () => {
    const { o, paymentId } = await lapsedHold(8, 5); // свободно ровно 3 = участникам заказа
    expect(await sync(paymentId, "cron")).toEqual({ kind: "late_paid", orderId: o.id });
    expect(await orderOf(o.id)).toMatchObject({ status: "paid", paymentStatus: "succeeded" });
    expect((await orderOf(o.id)).paidAt).toBeInstanceOf(Date);
    expect(gw.refunds).toHaveLength(0);
    expect((await journal())[0].note).toBe("late_paid");
  });

  it("a lapsed hold whose seats were taken meanwhile → full auto-refund, cancelled (late_refunded)", async () => {
    const { o, paymentId } = await lapsedHold(8, 6);
    expect(await sync(paymentId, "cron")).toEqual({ kind: "late_refunded", orderId: o.id });
    expect(await orderOf(o.id)).toMatchObject({ status: "cancelled", refundedAmount: 3270, refundId: "ref-1", paidAt: null });
    expect(gw.refunds).toHaveLength(1);
    expect(gw.refunds[0]).toMatchObject({ idempotenceKey: `late-refund-${o.id}`, paymentId, amount: 3270 });
    expect((await journal())[0].note).toBe("late_refunded");
  });

  it("a lapsed hold, seats taken, refund fails → late_refund_failed, the order is expired (not awaiting) and retried later", async () => {
    const { o, paymentId } = await lapsedHold(8, 8);
    gw.failNext("createRefund");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await sync(paymentId, "cron")).toEqual({ kind: "late_refund_failed", orderId: o.id });
      expect(await orderOf(o.id)).toMatchObject({ status: "expired", paymentStatus: "succeeded", refundedAmount: 0 });
      expect(await sync(paymentId, "sync")).toEqual({ kind: "late_refunded", orderId: o.id });
      expect((await orderOf(o.id)).status).toBe("cancelled");
    } finally {
      log.mockRestore();
    }
  });

  it("refund failure: order stays expired, late_refund_failed, journalled; the next sync retries with the same key", async () => {
    const { s } = await setup(8);
    const { o, token, paymentId } = await buy(s.id);
    await releaseHold(token, db);
    await occupy(s.id, 8);
    gw.setStatus(paymentId, "succeeded");
    gw.failNext("createRefund");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await sync(paymentId)).toEqual({ kind: "late_refund_failed", orderId: o.id });
      expect(await orderOf(o.id)).toMatchObject({ status: "expired", paymentStatus: "succeeded", refundedAmount: 0, refundId: null });
      expect(gw.refunds).toHaveLength(0);
      expect((await journal())[0]).toMatchObject({ orderId: o.id, note: "late_refund_failed" });
      expect(log).toHaveBeenCalled();
      expect(log.mock.calls.flat().map(String).join("\n")).not.toContain(token);

      expect(await sync(paymentId, "sync")).toEqual({ kind: "late_refunded", orderId: o.id });
      expect(await orderOf(o.id)).toMatchObject({ status: "cancelled", refundedAmount: 3270, refundId: "ref-1" });
      expect(gw.refunds).toHaveLength(1);
      expect(gw.refunds[0].idempotenceKey).toBe(`late-refund-${o.id}`);
    } finally {
      log.mockRestore();
    }
  });

  describe("after late_refund_failed the decision is sticky", () => {
    /** Поздняя оплата, мест нет, первый возврат упал. */
    async function failedOnce() {
      const { s } = await setup(8);
      const { o, token, paymentId } = await buy(s.id);
      await releaseHold(token, db);
      const occupier = await occupy(s.id, 8);
      gw.setStatus(paymentId, "succeeded");
      gw.failNext("createRefund");
      const first = await sync(paymentId);
      expect(first).toEqual({ kind: "late_refund_failed", orderId: o.id });
      return { s, o, paymentId, first, freeSeats: () => db.delete(orders).where(eq(orders.id, occupier)) };
    }

    let log: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      log = vi.spyOn(console, "error").mockImplementation(() => {});
    });
    afterEach(() => log.mockRestore());

    it("seats freed meanwhile: the retry refunds with the same key, never marks the order paid", async () => {
      const { o, paymentId, freeSeats } = await failedOnce();
      await freeSeats();
      expect(await sync(paymentId, "cron")).toEqual({ kind: "late_refunded", orderId: o.id });
      expect(await orderOf(o.id)).toMatchObject({ status: "cancelled", refundedAmount: 3270, refundId: "ref-1", paidAt: null });
      expect(gw.refunds).toHaveLength(1);
      expect(gw.refunds[0]).toMatchObject({ idempotenceKey: `late-refund-${o.id}`, paymentId, amount: 3270 });
      expect((await journal()).map((r) => r.note)).toEqual(["late_refund_failed", "late_refunded"]);
    });

    it("refunded by hand in the YooKassa dashboard: the order is closed without calling the API", async () => {
      const { o, paymentId, freeSeats } = await failedOnce();
      await freeSeats(); // даже со свободными местами заказ не становится оплаченным
      gw.setRefunded(paymentId, 3270);
      const createRefund = vi.spyOn(gw, "createRefund");

      expect(await sync(paymentId, "cron")).toEqual({ kind: "late_refunded", orderId: o.id });
      expect(createRefund).not.toHaveBeenCalled();
      expect(gw.refunds).toHaveLength(0);
      expect(await orderOf(o.id)).toMatchObject({ status: "cancelled", refundedAmount: 3270, refundId: null, paidAt: null });
      expect((await journal()).map((r) => r.note)).toEqual(["late_refund_failed", "refunded_externally"]);
    });

    it("a refund that went through on the gateway side after our timeout is picked up the same way", async () => {
      const { o, paymentId } = await failedOnce();
      // наш вызов упал по таймауту, но ЮKassa возврат провела
      gw.setRefunded(paymentId, 3270);
      expect(await sync(paymentId, "sync")).toEqual({ kind: "late_refunded", orderId: o.id });
      expect((await orderOf(o.id)).status).toBe("cancelled");
      expect(gw.refunds).toHaveLength(0);
    });

    it("a partial manual refund does not close the order: the full refund is retried", async () => {
      const { o, paymentId } = await failedOnce();
      gw.setRefunded(paymentId, 1000);
      expect(await sync(paymentId, "sync")).toEqual({ kind: "late_refunded", orderId: o.id });
      expect(gw.refunds).toHaveLength(1);
      expect((await orderOf(o.id)).refundedAmount).toBe(3270);
    });

    it("the retry fails again: noop (no second alert), the order stays expired, the failure is journalled", async () => {
      const { o, paymentId, first } = await failedOnce();
      gw.failNext("createRefund");
      const second = await sync(paymentId, "cron");
      expect(second).toEqual({ kind: "noop", orderId: o.id });
      expect(await orderOf(o.id)).toMatchObject({ status: "expired", refundedAmount: 0, refundId: null });
      expect((await journal()).map((r) => r.note)).toEqual(["late_refund_failed", "late_refund_failed"]);

      await runSyncEffects(first);
      await runSyncEffects(second);
      expect(notifyAlert).toHaveBeenCalledTimes(1);

      // и третья попытка всё ещё может пройти
      expect(await sync(paymentId, "cron")).toEqual({ kind: "late_refunded", orderId: o.id });
      expect(gw.refunds).toHaveLength(1);
    });
  });

  it("a misconfigured VAT code (vatCode() throws) is a refund failure too, no gateway call", async () => {
    const { s } = await setup(8);
    const { o, token, paymentId } = await buy(s.id);
    await releaseHold(token, db);
    await occupy(s.id, 8);
    gw.setStatus(paymentId, "succeeded");
    const createRefund = vi.spyOn(gw, "createRefund");
    vi.stubEnv("YOOKASSA_VAT_CODE", "abc");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await sync(paymentId)).toEqual({ kind: "late_refund_failed", orderId: o.id });
      expect(createRefund).not.toHaveBeenCalled();
      expect((await orderOf(o.id)).status).toBe("expired");
    } finally {
      log.mockRestore();
    }
  });

  it("a refund the gateway reports as canceled is a failure", async () => {
    const { s } = await setup(8);
    const { o, token, paymentId } = await buy(s.id);
    await releaseHold(token, db);
    await occupy(s.id, 8);
    gw.setStatus(paymentId, "succeeded");
    vi.spyOn(gw, "createRefund").mockResolvedValueOnce({ id: "ref-x", status: "canceled" });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await sync(paymentId)).toEqual({ kind: "late_refund_failed", orderId: o.id });
      expect(await orderOf(o.id)).toMatchObject({ status: "expired", refundId: null, refundedAmount: 0 });
    } finally {
      log.mockRestore();
    }
  });
});

describe("syncPayment: other statuses", () => {
  it("canceled: awaiting_payment → expired", async () => {
    const { s } = await setup();
    const { o, paymentId } = await buy(s.id);
    gw.setStatus(paymentId, "canceled");
    expect(await sync(paymentId)).toEqual({ kind: "expired", orderId: o.id });
    expect(await orderOf(o.id)).toMatchObject({ status: "expired", paymentStatus: "canceled" });
    expect((await journal())[0]).toMatchObject({ event: "payment.canceled", note: "expired" });
  });

  it.each(["paid", "expired", "cancelled"] as const)("canceled payment of a %s order is a noop", async (status) => {
    const { s } = await setup();
    const { o, paymentId } = await buy(s.id);
    await db.update(orders).set({ status }).where(eq(orders.id, o.id));
    gw.setStatus(paymentId, "canceled");
    expect(await sync(paymentId)).toEqual({ kind: "noop", orderId: o.id });
    expect((await orderOf(o.id)).status).toBe(status);
  });

  it("pending / waiting_for_capture: only payment_status is updated", async () => {
    const { s } = await setup();
    const { o, paymentId } = await buy(s.id);
    gw.setStatus(paymentId, "waiting_for_capture");
    expect(await sync(paymentId)).toEqual({ kind: "noop", orderId: o.id });
    expect(await orderOf(o.id)).toMatchObject({ status: "awaiting_payment", paymentStatus: "waiting_for_capture", paidAt: null });
    expect((await journal())[0]).toMatchObject({ event: "payment.waiting_for_capture", note: "noop" });
  });
});

describe("syncPayment: unknown payments and errors", () => {
  it("metadata points to a missing order → unknown, journalled without an order", async () => {
    gw.payments.set("pay-x", { id: "pay-x", status: "succeeded", amount: { value: "100.00", currency: "RUB" }, metadata: { order_id: "9999" }, confirmationToken: null });
    expect(await sync("pay-x")).toEqual({ kind: "unknown" });
    const rows = await journal();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ paymentId: "pay-x", orderId: null, event: "payment.succeeded", note: "unknown" });
  });

  it.each<Record<string, string>>([{}, { order_id: "abc" }, { order_id: "0" }, { order_id: "99999999999" }])("metadata %j → unknown", async (metadata) => {
    gw.payments.set("pay-x", { id: "pay-x", status: "succeeded", amount: { value: "100.00", currency: "RUB" }, metadata, confirmationToken: null });
    expect(await sync("pay-x")).toEqual({ kind: "unknown" });
    expect((await journal())[0].note).toBe("unknown");
  });

  it("the order is bound to another payment → unknown, the order is untouched", async () => {
    const { s } = await setup();
    const { o, paymentId } = await buy(s.id);
    gw.payments.set("pay-other", { id: "pay-other", status: "succeeded", amount: { value: "3270.00", currency: "RUB" }, metadata: { order_id: String(o.id) }, confirmationToken: null });
    expect(await sync("pay-other")).toEqual({ kind: "unknown" });
    expect(await orderOf(o.id)).toMatchObject({ status: "awaiting_payment", paymentId, paymentStatus: "pending" });
    expect((await journal())[0]).toMatchObject({ paymentId: "pay-other", orderId: null, note: "unknown" });
  });

  it("a getPayment failure propagates and writes nothing", async () => {
    const { s } = await setup();
    const { o, paymentId } = await buy(s.id);
    gw.failNext("getPayment");
    await expect(sync(paymentId)).rejects.toThrow("fake failure");
    expect(await journal()).toHaveLength(0);
    expect((await orderOf(o.id)).status).toBe("awaiting_payment");
  });
});

describe("recordPaymentEvent", () => {
  it("writes a journal row; orderId and note are optional", async () => {
    await recordPaymentEvent({ source: "webhook", event: "refund.succeeded", paymentId: "pay-1", payload: { id: "ref-1" } });
    await recordPaymentEvent({ source: "cron", event: "payment.succeeded", paymentId: "pay-1", orderId: null, payload: [1], note: "x" }, db);
    const rows = await journal();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ source: "webhook", event: "refund.succeeded", paymentId: "pay-1", orderId: null, note: "", payload: { id: "ref-1" } });
    expect(rows[0].receivedAt).toBeInstanceOf(Date);
    expect(rows[1]).toMatchObject({ source: "cron", note: "x", payload: [1] });
  });
});

describe("runSyncEffects", () => {
  async function paidOrder() {
    const { s } = await setup();
    const { o } = await buy(s.id);
    return { id: o.id, number: formatOrderNumber(o.number) };
  }
  const run = (kind: SyncOutcome["kind"], orderId?: number) => runSyncEffects({ kind, orderId });

  it.each(["paid", "late_paid"] as const)("%s: ticket e-mail and Telegram message", async (kind) => {
    const { id } = await paidOrder();
    await run(kind, id);
    expect(sendTicket).toHaveBeenCalledExactlyOnceWith(id, "paid");
    expect(notifyPaidOrder).toHaveBeenCalledExactlyOnceWith(id);
    expect(notifyAlert).not.toHaveBeenCalled();
    expect(sendSorry).not.toHaveBeenCalled();
  });

  it("late_refunded: apology e-mail and an alert with the order number", async () => {
    const { id, number } = await paidOrder();
    await run("late_refunded", id);
    expect(sendSorry).toHaveBeenCalledExactlyOnceWith(id);
    expect(notifyAlert).toHaveBeenCalledExactlyOnceWith(`Поздняя оплата ${number}: мест нет, оформлен автовозврат`);
    expect(sendTicket).not.toHaveBeenCalled();
    expect(notifyPaidOrder).not.toHaveBeenCalled();
  });

  it("late_refund_failed: only an alert asking for a manual refund", async () => {
    const { id, number } = await paidOrder();
    await run("late_refund_failed", id);
    expect(notifyAlert).toHaveBeenCalledExactlyOnceWith(`Поздняя оплата ${number}: мест нет, автовозврат не прошёл. Сайт повторит попытку ночью; если вернёте деньги вручную в кабинете ЮKassa, заказ закроется автоматически.`);
    expect(sendSorry).not.toHaveBeenCalled();
    expect(sendTicket).not.toHaveBeenCalled();
  });

  it("refunded_externally: cancellation e-mail and an alert that the refund came from the dashboard", async () => {
    const { id, number } = await paidOrder();
    await run("refunded_externally", id);
    expect(sendCancelled).toHaveBeenCalledExactlyOnceWith(id);
    expect(notifyAlert).toHaveBeenCalledExactlyOnceWith(`Возврат по заказу ${number} оформлен в кабинете ЮKassa — на сайте заказ отменён автоматически`);
    expect(sendSorry).not.toHaveBeenCalled();
    expect(sendTicket).not.toHaveBeenCalled();
    expect(notifyPaidOrder).not.toHaveBeenCalled();
  });

  it("mismatch: an alert with the order number", async () => {
    const { id, number } = await paidOrder();
    await run("mismatch", id);
    expect(notifyAlert).toHaveBeenCalledExactlyOnceWith(`Сумма платежа не совпала с заказом ${number}`);
    expect(sendTicket).not.toHaveBeenCalled();
  });

  it.each(["expired", "noop", "unknown"] as const)("%s: nothing to do", async (kind) => {
    const { id } = await paidOrder();
    await run(kind, kind === "unknown" ? undefined : id);
    for (const f of [sendTicket, sendSorry, sendCancelled, notifyPaidOrder, notifyAlert]) expect(f).not.toHaveBeenCalled();
  });

  it("an outcome without an order does nothing", async () => {
    await run("paid");
    for (const f of [sendTicket, sendSorry, sendCancelled, notifyPaidOrder, notifyAlert]) expect(f).not.toHaveBeenCalled();
  });

  it("never throws: a failing step is logged and the next one still runs", async () => {
    const { id } = await paidOrder();
    vi.mocked(sendTicket).mockRejectedValueOnce(new Error("mail down"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(run("paid", id)).resolves.toBeUndefined();
      expect(notifyPaidOrder).toHaveBeenCalledWith(id);
      expect(log).toHaveBeenCalledTimes(1);
    } finally {
      log.mockRestore();
    }
  });

  it("an alert still goes out when the order number cannot be read (falls back to the id)", async () => {
    await run("mismatch", 9999);
    expect(notifyAlert).toHaveBeenCalledExactlyOnceWith("Сумма платежа не совпала с заказом #9999");
  });
});
