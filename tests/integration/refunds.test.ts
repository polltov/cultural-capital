import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, tours, tourSessions } from "@/db/schema";
import { formatRub } from "@/lib/domain/pricing";
import { moveOrder, listMoveTargets, refundOrder } from "@/server/refunds";
import { occupiedSeats } from "@/server/orders";
import type { GatewayRefund } from "@/server/payments/types";
import { fakeGateway, type FakeGateway } from "../support/fake-gateway";

const H = 3600_000;
const CANT_REFUND = "Вернуть деньги можно только по оплаченному заказу";
const CANT_MOVE = "Перенести можно только оплаченный заказ";
const UNAVAILABLE = "Этот сеанс недоступен для переноса";

let gw: FakeGateway;
let log: MockInstance<typeof console.error>;
beforeEach(() => {
  gw = fakeGateway();
  log = vi.spyOn(console, "error").mockImplementation(() => {}); // сбой возврата логируется
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

async function setup(capacity = 8) {
  const [t] = await db.insert(tours).values({ slug: "a", title: "Эрмитаж", durationLabel: "2 часа", ageLabel: "6+", priceChild: 1000, priceAdult: 1270, published: true }).returning();
  const s = await addSession(t.id, capacity);
  return { t, s };
}

async function addSession(tourId: number, capacity = 8, over: Partial<typeof tourSessions.$inferInsert> = {}) {
  const [s] = await db.insert(tourSessions).values({ tourId, startsAt: new Date(Date.now() + 48 * H), capacity, ...over }).returning();
  return s;
}

/** Оплаченный заказ на 2 детей + 1 взрослого (3270 ₽), платёж pay-1. */
async function paidOrder(sessionId: number, over: Partial<typeof orders.$inferInsert> = {}) {
  const [o] = await db
    .insert(orders)
    .values({
      sessionId, customerName: "Анна", phone: "+79991234567", email: "anna@example.com", children: 2, adults: 1,
      priceChildSnapshot: 1000, priceAdultSnapshot: 1270, total: 3270, status: "paid", paymentId: "pay-1", paymentStatus: "succeeded",
      paidAt: new Date(), consentAt: new Date(), ...over,
    })
    .returning();
  return o;
}

/** Занять `n` мест чужим оплаченным заказом. */
async function occupy(sessionId: number, n: number) {
  return paidOrder(sessionId, { customerName: "X", children: n, adults: 0, total: 1, paymentId: null });
}

/**
 * Запускает `run`, пока снаружи удерживается блокировка `lock`: все вызовы доходят до неё одновременно.
 * Без собственных блокировок в коде вызовы не стали бы ждать и разошлись бы по гонке.
 */
async function whileLocked<T>(lock: SQL, run: () => Promise<T>): Promise<T> {
  let release!: () => void;
  let locked!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const isLocked = new Promise<void>((r) => (locked = r));
  const holder = db.transaction(async (tx) => {
    await tx.execute(lock);
    locked();
    await gate;
  });
  await isLocked;
  const result = run();
  await new Promise((r) => setTimeout(r, 300));
  release();
  await holder;
  return result;
}
const lockOrder = (id: number) => sql`select id from orders where id = ${id} for update`;
const lockSession = (id: number) => sql`select id from tour_sessions where id = ${id} for update`;

const orderOf = async (id: number) => (await db.select().from(orders).where(eq(orders.id, id)))[0];
const refund = (id: number, amount: number, g: FakeGateway = gw) => refundOrder(id, amount, { db, gateway: g });

describe("refundOrder", () => {
  it("refunds through the gateway with the idempotence key, cancels the order and frees the seats", async () => {
    const { s } = await setup();
    const o = await paidOrder(s.id);
    expect(await occupiedSeats(db, s.id)).toBe(3);

    expect(await refund(o.id, 1635)).toEqual({ ok: true });

    expect(gw.refunds).toHaveLength(1);
    expect(gw.refunds[0]).toMatchObject({ idempotenceKey: `refund-${o.id}`, paymentId: "pay-1", amount: 1635, customerEmail: "anna@example.com" });
    expect(gw.refunds[0].items).toHaveLength(1);
    expect(gw.refunds[0].items[0]).toMatchObject({ quantity: 1, amount: { value: "1635.00", currency: "RUB" }, vat_code: 1, payment_mode: "full_prepayment" });
    expect(gw.refunds[0].items[0].description).toContain("Возврат");
    expect(gw.refunds[0].items[0].description).toContain("Эрмитаж");

    const after = await orderOf(o.id);
    expect(after).toMatchObject({ status: "cancelled", refundedAmount: 1635, refundId: "ref-1" });
    expect(await occupiedSeats(db, s.id)).toBe(0);
  });

  it("a full refund of the whole total works (amount = total)", async () => {
    const { s } = await setup();
    const o = await paidOrder(s.id);
    expect(await refund(o.id, 3270)).toEqual({ ok: true });
    expect(gw.refunds[0].amount).toBe(3270);
    expect(await orderOf(o.id)).toMatchObject({ status: "cancelled", refundedAmount: 3270 });
  });

  it("a second call is rejected and does not reach the gateway again", async () => {
    const { s } = await setup();
    const o = await paidOrder(s.id);
    await refund(o.id, 1635);

    const again = await refund(o.id, 1635);
    expect(again).toEqual({ ok: false, error: CANT_REFUND });
    expect(gw.refunds).toHaveLength(1);
    expect(await orderOf(o.id)).toMatchObject({ status: "cancelled", refundedAmount: 1635 });
  });

  it("two simultaneous clicks refund once", async () => {
    const { s } = await setup();
    const o = await paidOrder(s.id);
    const results = await whileLocked(lockOrder(o.id), () => Promise.all([refund(o.id, 3270), refund(o.id, 3270)]));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, error: CANT_REFUND });
    expect(gw.refunds).toHaveLength(1);
  });

  it("a gateway error leaves the order untouched and is reported with its text", async () => {
    const { s } = await setup();
    const o = await paidOrder(s.id);
    gw.failNext("createRefund");

    expect(await refund(o.id, 1635)).toEqual({ ok: false, error: "Возврат не прошёл: fake failure" });
    expect(log).toHaveBeenCalledTimes(1);
    expect(await orderOf(o.id)).toMatchObject({ status: "paid", refundedAmount: 0, refundId: null });
    expect(await occupiedSeats(db, s.id)).toBe(3);

    // повтор после сбоя проходит
    expect(await refund(o.id, 1635)).toEqual({ ok: true });
    expect(gw.refunds).toHaveLength(1);
  });

  it("a refund the gateway reports as canceled is a failure; a pending one is a success", async () => {
    const { s } = await setup();
    const o = await paidOrder(s.id);
    const result: { value: GatewayRefund } = { value: { id: "ref-x", status: "canceled" } };
    gw.createRefund = async () => result.value;

    expect(await refund(o.id, 1635)).toEqual({ ok: false, error: "Возврат не прошёл: ЮKassa отклонила возврат" });
    expect(await orderOf(o.id)).toMatchObject({ status: "paid", refundedAmount: 0, refundId: null });

    result.value = { id: "ref-y", status: "pending" };
    expect(await refund(o.id, 1635)).toEqual({ ok: true });
    expect(await orderOf(o.id)).toMatchObject({ status: "cancelled", refundedAmount: 1635, refundId: "ref-y" });
  });

  it("an invalid VAT code is a refund failure too, the order is unchanged", async () => {
    vi.stubEnv("YOOKASSA_VAT_CODE", "abc");
    const { s } = await setup();
    const o = await paidOrder(s.id);

    const r = await refund(o.id, 1635);
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.error).toMatch(/^Возврат не прошёл: YOOKASSA_VAT_CODE/);
    expect(gw.refunds).toHaveLength(0);
    expect((await orderOf(o.id)).status).toBe("paid");
  });

  it("missing YooKassa settings are a refund failure when no gateway is injected", async () => {
    vi.stubEnv("YOOKASSA_SHOP_ID", "");
    vi.stubEnv("YOOKASSA_SECRET_KEY", "");
    const { s } = await setup();
    const o = await paidOrder(s.id);

    expect(await refundOrder(o.id, 1635, { db })).toEqual({ ok: false, error: "Возврат не прошёл: ЮKassa не настроена" });
    expect((await orderOf(o.id)).status).toBe("paid");
  });

  it("an order without an e-mail cannot get a refund receipt: failure, order unchanged", async () => {
    const { s } = await setup();
    const o = await paidOrder(s.id, { email: null });
    expect(await refund(o.id, 1635)).toEqual({ ok: false, error: "Возврат не прошёл: у заказа нет email для чека возврата" });
    expect(gw.refunds).toHaveLength(0);
    expect((await orderOf(o.id)).status).toBe("paid");
  });

  it.each([4000, 3271, -1, 1635.5, Number.NaN, Number.POSITIVE_INFINITY])("rejects the amount %s outside 0…total", async (amount) => {
    const { s } = await setup();
    const o = await paidOrder(s.id);

    expect(await refund(o.id, amount)).toEqual({ ok: false, error: `Сумма возврата — от 0 до ${formatRub(3270)}` });
    expect(gw.refunds).toHaveLength(0);
    expect((await orderOf(o.id)).status).toBe("paid");
  });

  it("amount 0 cancels without calling the gateway", async () => {
    const { s } = await setup();
    const o = await paidOrder(s.id);

    expect(await refundOrder(o.id, 0, { db, gateway: gw })).toEqual({ ok: true });
    expect(gw.refunds).toHaveLength(0);
    expect(await orderOf(o.id)).toMatchObject({ status: "cancelled", refundedAmount: 0, refundId: null });
    expect(await occupiedSeats(db, s.id)).toBe(0);
  });

  it("amount 0 does not even need a configured gateway", async () => {
    vi.stubEnv("YOOKASSA_SHOP_ID", "");
    vi.stubEnv("YOOKASSA_SECRET_KEY", "");
    const { s } = await setup();
    const o = await paidOrder(s.id);
    expect(await refundOrder(o.id, 0, { db })).toEqual({ ok: true });
    expect((await orderOf(o.id)).status).toBe("cancelled");
  });

  it.each(["new", "confirmed", "done", "cancelled", "awaiting_payment", "expired"] as const)("refuses an order in status %s", async (status) => {
    const { s } = await setup();
    const o = await paidOrder(s.id, { status });
    expect(await refund(o.id, 1635)).toEqual({ ok: false, error: CANT_REFUND });
    expect(gw.refunds).toHaveLength(0);
    expect((await orderOf(o.id)).status).toBe(status);
  });

  it("refuses a paid order that has no payment id", async () => {
    const { s } = await setup();
    const o = await paidOrder(s.id, { paymentId: null });
    expect(await refund(o.id, 1635)).toEqual({ ok: false, error: CANT_REFUND });
    expect(gw.refunds).toHaveLength(0);
    expect((await orderOf(o.id)).status).toBe("paid");
  });

  it("reports a missing order", async () => {
    expect(await refund(999, 100)).toEqual({ ok: false, error: "Заказ не найден" });
  });
});

describe("moveOrder", () => {
  it("moves a paid order to another session of the same tour and recounts the seats in both", async () => {
    const { t, s } = await setup();
    const target = await addSession(t.id, 8, { startsAt: new Date(Date.now() + 72 * H) });
    const o = await paidOrder(s.id);
    expect(await occupiedSeats(db, s.id)).toBe(3);
    expect(await occupiedSeats(db, target.id)).toBe(0);

    expect(await moveOrder(o.id, target.id, db)).toEqual({ ok: true });

    const after = await orderOf(o.id);
    expect(after).toMatchObject({ sessionId: target.id, status: "paid", total: 3270, paymentId: "pay-1", refundedAmount: 0 });
    expect(await occupiedSeats(db, s.id)).toBe(0);
    expect(await occupiedSeats(db, target.id)).toBe(3);
  });

  it("moves into a session that fits exactly", async () => {
    const { t, s } = await setup();
    const target = await addSession(t.id, 8);
    await occupy(target.id, 5);
    const o = await paidOrder(s.id);
    expect(await moveOrder(o.id, target.id, db)).toEqual({ ok: true });
    expect(await occupiedSeats(db, target.id)).toBe(8);
  });

  it("refuses a full session with the free/needed numbers", async () => {
    const { t, s } = await setup();
    const target = await addSession(t.id, 8);
    await occupy(target.id, 7);
    const o = await paidOrder(s.id);

    expect(await moveOrder(o.id, target.id, db)).toEqual({ ok: false, error: "В выбранном сеансе свободно 1, в заказе 3" });
    expect((await orderOf(o.id)).sessionId).toBe(s.id);
  });

  it("never reports negative free seats", async () => {
    const { t, s } = await setup();
    const target = await addSession(t.id, 2);
    await occupy(target.id, 4); // лимит потом уменьшили ниже занятого
    const o = await paidOrder(s.id);
    expect(await moveOrder(o.id, target.id, db)).toEqual({ ok: false, error: "В выбранном сеансе свободно 0, в заказе 3" });
  });

  it("an active payment hold of another customer counts as occupied", async () => {
    const { t, s } = await setup();
    const target = await addSession(t.id, 4);
    await paidOrder(target.id, { status: "awaiting_payment", paymentId: null, holdExpiresAt: new Date(Date.now() + 10 * 60_000), children: 2, adults: 0, total: 2000 });
    const o = await paidOrder(s.id);
    expect(await moveOrder(o.id, target.id, db)).toEqual({ ok: false, error: "В выбранном сеансе свободно 2, в заказе 3" });
  });

  it("refuses sessions that are of another tour, past, hidden or missing", async () => {
    const { t, s } = await setup();
    const [other] = await db.insert(tours).values({ slug: "b", title: "Кремль", durationLabel: "2 часа", ageLabel: "6+", priceChild: 1, priceAdult: 1, published: true }).returning();
    const o = await paidOrder(s.id);
    const foreign = await addSession(other.id);
    const past = await addSession(t.id, 8, { startsAt: new Date(Date.now() - H) });
    const hidden = await addSession(t.id, 8, { hidden: true });

    for (const id of [foreign.id, past.id, hidden.id, 99999]) {
      expect(await moveOrder(o.id, id, db)).toEqual({ ok: false, error: UNAVAILABLE });
    }
    expect((await orderOf(o.id)).sessionId).toBe(s.id);
  });

  it("refuses the session the order is already in", async () => {
    const { s } = await setup();
    const o = await paidOrder(s.id);
    expect(await moveOrder(o.id, s.id, db)).toEqual({ ok: false, error: "Заказ уже назначен на этот сеанс" });
  });

  it.each(["new", "confirmed", "done", "cancelled", "awaiting_payment", "expired"] as const)("refuses an order in status %s", async (status) => {
    const { t, s } = await setup();
    const target = await addSession(t.id);
    const o = await paidOrder(s.id, { status });
    expect(await moveOrder(o.id, target.id, db)).toEqual({ ok: false, error: CANT_MOVE });
    expect((await orderOf(o.id)).sessionId).toBe(s.id);
  });

  it("reports a missing order", async () => {
    const { s } = await setup();
    expect(await moveOrder(999, s.id, db)).toEqual({ ok: false, error: "Заказ не найден" });
  });

  it("two orders moved into the last seats at the same time: one wins", async () => {
    const { t, s } = await setup();
    const target = await addSession(t.id, 3);
    const a = await paidOrder(s.id, { paymentId: "pay-a" });
    const b = await paidOrder(s.id, { paymentId: "pay-b" });

    const results = await whileLocked(lockSession(target.id), () => Promise.all([moveOrder(a.id, target.id, db), moveOrder(b.id, target.id, db)]));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, error: "В выбранном сеансе свободно 0, в заказе 3" });
    expect(await occupiedSeats(db, target.id)).toBe(3);
  });

  it("two orders swapped crosswise at the same time do not deadlock (sessions are locked by ascending id)", async () => {
    const { t, s } = await setup();
    const other = await addSession(t.id);
    const a = await paidOrder(s.id, { paymentId: "pay-a" });
    const b = await paidOrder(other.id, { paymentId: "pay-b" });

    // Сеанс с меньшим id занят снаружи: оба переноса успевают взять свою первую блокировку до его освобождения.
    const results = await whileLocked(lockSession(s.id), () => Promise.all([moveOrder(a.id, other.id, db), moveOrder(b.id, s.id, db)]));
    expect(results).toEqual([{ ok: true }, { ok: true }]);
    expect((await orderOf(a.id)).sessionId).toBe(other.id);
    expect((await orderOf(b.id)).sessionId).toBe(s.id);
  });
});

describe("listMoveTargets", () => {
  it("lists future visible sessions of the same tour with enough free seats, soonest first", async () => {
    const { t, s } = await setup();
    const [other] = await db.insert(tours).values({ slug: "b", title: "Кремль", durationLabel: "2 часа", ageLabel: "6+", priceChild: 1, priceAdult: 1, published: true }).returning();
    const o = await paidOrder(s.id);

    const later = await addSession(t.id, 8, { startsAt: new Date(Date.now() + 96 * H) });
    const sooner = await addSession(t.id, 8, { startsAt: new Date(Date.now() + 24 * H) });
    const tight = await addSession(t.id, 5, { startsAt: new Date(Date.now() + 72 * H) });
    await occupy(tight.id, 2); // свободно ровно 3 = участников заказа
    const full = await addSession(t.id, 5);
    await occupy(full.id, 3); // свободно 2 < 3
    await addSession(t.id, 8, { startsAt: new Date(Date.now() - H) }); // прошедший
    await addSession(t.id, 8, { hidden: true });
    await addSession(other.id, 8); // чужая экскурсия

    const targets = await listMoveTargets(o.id, db);
    expect(targets.map((x) => ({ id: x.id, free: x.free }))).toEqual([
      { id: sooner.id, free: 8 },
      { id: tight.id, free: 3 },
      { id: later.id, free: 8 },
    ]);
    expect(targets[0].startsAt).toEqual(sooner.startsAt);
    expect(targets.map((x) => x.id)).not.toContain(s.id);
  });

  it("is empty for a missing order", async () => {
    expect(await listMoveTargets(999, db)).toEqual([]);
  });

  it("does not count the order itself against the sessions it could go to", async () => {
    const { t, s } = await setup(3); // текущий сеанс забит этим заказом целиком
    const target = await addSession(t.id, 3);
    const o = await paidOrder(s.id);
    expect((await listMoveTargets(o.id, db)).map((x) => x.id)).toEqual([target.id]);
  });
});
