import { beforeEach, describe, it, expect, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { tours, tourSessions, orders, rateLimitHits } from "@/db/schema";
import { occupiedSeats } from "@/server/orders";
import { startCheckout, releaseHold } from "@/server/checkout";
import { PaymentGatewayError } from "@/server/payments/types";
import { notifyAlert } from "@/server/telegram";
import { fakeGateway } from "../support/fake-gateway";
import { lockSession, whileLocked } from "../support/lock-gate";

vi.mock("@/server/telegram", () => ({ notifyAlert: vi.fn() }));

beforeEach(() => {
  vi.mocked(notifyAlert).mockReset();
  vi.mocked(notifyAlert).mockResolvedValue(undefined);
});

const H = 3600_000;
const valid = { children: 2, adults: 1, name: "Анна", phone: "8 (999) 123-45-67", email: "anna@example.com", consent: true, website: "" };
const GATEWAY_DOWN = "Оплата временно недоступна. Попробуйте позже или позвоните нам.";

async function setup(o: { published?: boolean; hidden?: boolean; offset?: number; capacity?: number } = {}) {
  const [t] = await db.insert(tours).values({ slug: "a", title: "Эрмитаж", durationLabel: "2 часа", ageLabel: "6+", priceChild: 1000, priceAdult: 1270, published: o.published ?? true }).returning();
  const [s] = await db.insert(tourSessions).values({ tourId: t.id, startsAt: new Date(Date.now() + (o.offset ?? 24) * H), hidden: o.hidden ?? false, capacity: o.capacity ?? 8 }).returning();
  return { t, s };
}

/** Занять `n` мест подтверждённой заявкой. */
async function occupy(sessionId: number, n: number) {
  await db.insert(orders).values({ sessionId, customerName: "X", phone: "+7", priceChildSnapshot: 1, priceAdultSnapshot: 1, total: 1, consentAt: new Date(), children: n, adults: 0, status: "confirmed" });
}

function deps() {
  const gateway = fakeGateway();
  return { db, gateway, createPayment: vi.spyOn(gateway, "createPayment") };
}

describe("startCheckout", () => {
  it("creates an awaiting_payment order with a hold and a gateway payment", async () => {
    const { s } = await setup();
    const d = deps();
    const before = Date.now();
    const r = await startCheckout({ ...valid, sessionId: s.id }, "1.1.1.1", d);
    expect(r).toMatchObject({ ok: true, confirmationToken: "ct-1" });
    if (!r.ok) throw new Error("unreachable");
    expect(r.orderToken).toHaveLength(43);

    const [o] = await db.select().from(orders);
    expect(o).toMatchObject({
      status: "awaiting_payment", total: 3270, children: 2, adults: 1, priceChildSnapshot: 1000, priceAdultSnapshot: 1270,
      paymentId: "pay-1", paymentStatus: "pending", accessToken: r.orderToken, email: "anna@example.com",
      phone: "+79991234567", customerName: "Анна",
    });
    expect(o.consentAt).toBeInstanceOf(Date);
    expect(r.holdSeconds).toBeGreaterThanOrEqual(15 * 60 - 2);
    expect(r.holdSeconds).toBeLessThanOrEqual(15 * 60);
    expect(o.holdExpiresAt!.getTime() - before).toBeGreaterThanOrEqual(15 * 60_000);
    expect(o.holdExpiresAt!.getTime() - Date.now()).toBeLessThanOrEqual(15 * 60_000);
    expect(8 - (await occupiedSeats(db, s.id))).toBe(5);

    expect(d.createPayment).toHaveBeenCalledTimes(1);
    const req = d.createPayment.mock.calls[0][0];
    expect(req).toMatchObject({
      idempotenceKey: r.orderToken, amount: 3270, orderId: o.id,
      customer: { email: "anna@example.com", phone: "79991234567", fullName: "Анна" },
    });
    expect(req.description).toMatch(/^КС-0001 · Эрмитаж · \d\d\.\d\d \d\d:\d\d$/);
    expect(req.items).toHaveLength(2);
    expect(req.items.map((i) => [i.quantity, i.amount.value, i.payment_mode])).toEqual([
      [2, "1000.00", "full_prepayment"],
      [1, "1270.00", "full_prepayment"],
    ]);
    expect(d.gateway.payments.get("pay-1")).toMatchObject({ amount: { value: "3270.00", currency: "RUB" }, metadata: { order_id: String(o.id) } });
  });

  it("holdSeconds is what is left of the hold after the gateway call, by the server clock", async () => {
    const { s } = await setup();
    const d = deps();
    const create = d.gateway.createPayment.bind(d.gateway);
    d.gateway.createPayment = async (i) => {
      await new Promise((r) => setTimeout(r, 1100)); // медленный ответ ЮKassa съедает часть удержания
      return create(i);
    };
    const r = await startCheckout({ ...valid, sessionId: s.id }, "1.1.1.1", d);
    if (!r.ok) throw new Error("unreachable");
    const [o] = await db.select().from(orders);
    expect(r.holdSeconds).toBeLessThanOrEqual(15 * 60 - 1);
    expect(Math.abs(r.holdSeconds * 1000 - (o.holdExpiresAt!.getTime() - Date.now()))).toBeLessThan(2000);
    expect(r).not.toHaveProperty("holdExpiresAt");
  });

  it("takes the total from DB prices, not from the input", async () => {
    const { s } = await setup();
    const r = await startCheckout({ ...valid, sessionId: s.id, total: 1, priceChild: 1, priceAdult: 1 }, "1.1.1.1", deps());
    expect(r.ok).toBe(true);
    expect((await db.select().from(orders))[0].total).toBe(3270);
  });

  it("email is required and checked", async () => {
    const { s } = await setup();
    const empty = await startCheckout({ ...valid, sessionId: s.id, email: "" }, "1.1.1.1", deps());
    expect(empty.ok === false && empty.fieldErrors?.email).toBe("Укажите email");
    const missing = await startCheckout({ ...valid, sessionId: s.id, email: undefined }, "1.1.1.1", deps());
    expect(missing.ok === false && missing.fieldErrors?.email).toBe("Укажите email");
    const bad = await startCheckout({ ...valid, sessionId: s.id, email: "abc" }, "1.1.1.1", deps());
    expect(bad.ok === false && bad.fieldErrors?.email).toBe("Проверьте email");
    expect(await db.select().from(orders)).toHaveLength(0);
  });

  it("field errors are in Russian and do not need the gateway", async () => {
    const bad: Record<string, unknown>[] = [
      { sessionId: "abc" }, { sessionId: null }, { sessionId: 3000000000 }, { children: 21 }, { children: -1 }, { adults: 99 },
      { phone: "12345" }, { phone: null }, { name: "" }, { name: "x".repeat(81) }, { consent: false }, { consent: undefined },
      { email: 5 }, { children: 0, adults: 0 },
    ];
    for (const b of bad) {
      const r = await startCheckout({ ...valid, sessionId: 1, ...b }, "4.4.4.4", {});
      expect(r.ok, JSON.stringify(b)).toBe(false);
      const msgs = Object.values((r as { fieldErrors?: Record<string, string> }).fieldErrors ?? {});
      expect(msgs.length, JSON.stringify(b)).toBeGreaterThan(0);
      for (const m of msgs) expect(m, JSON.stringify(b)).toMatch(/[а-яё]/i);
    }
  });

  it("honeypot: silent rejection, no order, no payment, no rate hit", async () => {
    const { s } = await setup();
    const d = deps();
    const r = await startCheckout({ ...valid, sessionId: s.id, website: "http://spam" }, "1.1.1.1", d);
    expect(r).toEqual({ ok: false });
    expect(await db.select().from(orders)).toHaveLength(0);
    expect(await db.select().from(rateLimitHits)).toHaveLength(0);
    expect(d.createPayment).not.toHaveBeenCalled();
  });

  it("not enough seats / no seats", async () => {
    const { s } = await setup({ capacity: 8 });
    await occupy(s.id, 6);
    const d = deps();
    expect(await startCheckout({ ...valid, sessionId: s.id }, "1.1.1.1", d)).toEqual({ ok: false, error: "Осталось мест: 2" });
    await occupy(s.id, 2);
    expect(await startCheckout({ ...valid, sessionId: s.id }, "1.1.1.1", d)).toEqual({ ok: false, error: "Мест не осталось" });
    expect(await db.select().from(orders)).toHaveLength(2);
    expect(d.createPayment).not.toHaveBeenCalled();
  });

  it("an active hold of another order takes seats, an expired one does not", async () => {
    const { s } = await setup({ capacity: 8 });
    const base = { sessionId: s.id, customerName: "X", phone: "+7", priceChildSnapshot: 1, priceAdultSnapshot: 1, total: 1, consentAt: new Date(), children: 3, adults: 0, status: "awaiting_payment" as const };
    await db.insert(orders).values([
      { ...base, holdExpiresAt: new Date(Date.now() + 10 * 60_000) },
      { ...base, children: 4, holdExpiresAt: new Date(Date.now() - 60_000) },
    ]);
    const r = await startCheckout({ ...valid, sessionId: s.id, children: 6, adults: 0 }, "1.1.1.1", deps());
    expect(r).toEqual({ ok: false, error: "Осталось мест: 5" });
  });

  it.each([
    ["missing session", async () => ({ sessionId: 9999 })],
    ["past session", async () => ({ sessionId: (await setup({ offset: -24 })).s.id })],
    ["hidden session", async () => ({ sessionId: (await setup({ hidden: true })).s.id })],
    ["unpublished tour", async () => ({ sessionId: (await setup({ published: false })).s.id })],
  ])("rejects %s", async (_n, mk) => {
    const extra = await mk();
    const d = deps();
    const r = await startCheckout({ ...valid, ...extra }, "1.1.1.1", d);
    expect(r).toEqual({ ok: false, error: "Этот сеанс недоступен для покупки" });
    expect(await db.select().from(orders)).toHaveLength(0);
    expect(d.createPayment).not.toHaveBeenCalled();
  });

  it("two parallel purchases of 3 seats with 4 free: exactly one passes", async () => {
    const { s } = await setup({ capacity: 8 });
    await occupy(s.id, 4);
    const d = deps();
    // Держим блокировку сеанса снаружи, пока обе покупки дойдут до своих транзакций: без FOR UPDATE обе прошли бы проверку мест.
    const results = await whileLocked(lockSession(s.id), () =>
      Promise.all([
        startCheckout({ ...valid, sessionId: s.id, children: 3, adults: 0 }, "1.1.1.1", d),
        startCheckout({ ...valid, sessionId: s.id, children: 3, adults: 0 }, "2.2.2.2", d),
      ]),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, error: "Осталось мест: 1" }]);
    expect(await occupiedSeats(db, s.id)).toBe(7);
    expect(d.createPayment).toHaveBeenCalledTimes(1);
  });

  it("gateway failure: order expired, seats released, error logged without secrets", async () => {
    const { s } = await setup();
    const d = deps();
    d.gateway.failNext("createPayment");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const r = await startCheckout({ ...valid, sessionId: s.id }, "1.1.1.1", d);
      expect(r).toEqual({ ok: false, error: GATEWAY_DOWN });
      const [o] = await db.select().from(orders);
      expect(o.status).toBe("expired");
      expect(o.paymentId).toBeNull();
      expect(8 - (await occupiedSeats(db, s.id))).toBe(8);
      expect(log).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(log.mock.calls)).not.toContain(o.accessToken!);
    } finally {
      log.mockRestore();
    }
  });

  it("an unconfigured gateway (no ЮKassa env) is the same failure: order expired, seats released", async () => {
    const { s } = await setup();
    const saved = { id: process.env.YOOKASSA_SHOP_ID, key: process.env.YOOKASSA_SECRET_KEY };
    delete process.env.YOOKASSA_SHOP_ID;
    delete process.env.YOOKASSA_SECRET_KEY;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const r = await startCheckout({ ...valid, sessionId: s.id }, "1.1.1.1", { db });
      expect(r).toEqual({ ok: false, error: GATEWAY_DOWN });
      expect((await db.select().from(orders))[0].status).toBe("expired");
      expect(await occupiedSeats(db, s.id)).toBe(0);
    } finally {
      log.mockRestore();
      if (saved.id !== undefined) process.env.YOOKASSA_SHOP_ID = saved.id;
      if (saved.key !== undefined) process.env.YOOKASSA_SECRET_KEY = saved.key;
    }
  });

  it("an invalid YOOKASSA_VAT_CODE is a gateway failure too (no payment is created)", async () => {
    const { s } = await setup();
    const d = deps();
    const saved = process.env.YOOKASSA_VAT_CODE;
    process.env.YOOKASSA_VAT_CODE = "abc";
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const r = await startCheckout({ ...valid, sessionId: s.id }, "1.1.1.1", d);
      expect(r).toEqual({ ok: false, error: GATEWAY_DOWN });
      expect((await db.select().from(orders))[0].status).toBe("expired");
      expect(d.createPayment).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
      if (saved === undefined) delete process.env.YOOKASSA_VAT_CODE;
      else process.env.YOOKASSA_VAT_CODE = saved;
    }
  });

  it("11th valid attempt from one IP in an hour is limited; invalid input does not burn quota", async () => {
    const { s } = await setup({ capacity: 100 });
    const d = deps();
    for (let i = 0; i < 5; i++) await startCheckout({ ...valid, sessionId: s.id, phone: "1" }, "3.3.3.3", d);
    for (let i = 0; i < 10; i++) {
      expect((await startCheckout({ ...valid, sessionId: s.id, children: 1, adults: 0 }, "3.3.3.3", d)).ok, `attempt ${i + 1}`).toBe(true);
    }
    const r = await startCheckout({ ...valid, sessionId: s.id }, "3.3.3.3", d);
    expect(r).toEqual({ ok: false, error: "Слишком много попыток. Попробуйте позже или позвоните нам." });
    expect(await db.select().from(orders)).toHaveLength(10);
    // другой IP не затронут
    expect((await startCheckout({ ...valid, sessionId: s.id }, "4.4.4.4", d)).ok).toBe(true);
  });
});

describe("startCheckout: the owner learns that payments are failing", () => {
  const failing = (message: string) => {
    const d = deps();
    d.gateway.failNext("createPayment", new PaymentGatewayError(message, 403));
    return d;
  };
  const alertText = (message: string) => `Оплата на сайте не создаётся: ${message} — проверьте настройки ЮKassa`;
  let log: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    log = vi.spyOn(console, "error").mockImplementation(() => {});
    return () => log.mockRestore();
  });

  it("a gateway failure alerts once an hour, with the error text and no customer data", async () => {
    const { s } = await setup({ capacity: 20 });
    expect(await startCheckout({ ...valid, sessionId: s.id }, "1.1.1.1", failing("Shop is blocked"))).toEqual({ ok: false, error: GATEWAY_DOWN });
    expect(await startCheckout({ ...valid, sessionId: s.id }, "2.2.2.2", failing("Shop is blocked"))).toEqual({ ok: false, error: GATEWAY_DOWN });

    expect(notifyAlert).toHaveBeenCalledExactlyOnceWith(alertText("Shop is blocked"));
    const sent = JSON.stringify(vi.mocked(notifyAlert).mock.calls);
    for (const o of await db.select().from(orders)) expect(sent).not.toContain(o.accessToken!);
    expect(sent).not.toMatch(/anna@example\.com|9991234567|Анна|1\.1\.1\.1/);
  });

  it("an hour later the next failure alerts again", async () => {
    const { s } = await setup({ capacity: 20 });
    await startCheckout({ ...valid, sessionId: s.id }, "1.1.1.1", failing("first"));
    await db.update(rateLimitHits).set({ createdAt: new Date(Date.now() - 3601_000) }).where(eq(rateLimitHits.key, "alert:checkout"));
    await startCheckout({ ...valid, sessionId: s.id }, "1.1.1.1", failing("second"));
    expect(vi.mocked(notifyAlert).mock.calls).toEqual([[alertText("first")], [alertText("second")]]);
  });

  it("a long error is cut to 200 characters", async () => {
    const { s } = await setup();
    await startCheckout({ ...valid, sessionId: s.id }, "1.1.1.1", failing("x".repeat(500)));
    expect(notifyAlert).toHaveBeenCalledExactlyOnceWith(alertText("x".repeat(200)));
  });

  it("the alert itself failing does not change the customer's answer", async () => {
    vi.mocked(notifyAlert).mockRejectedValue(new Error("telegram down"));
    const { s } = await setup();
    expect(await startCheckout({ ...valid, sessionId: s.id }, "1.1.1.1", failing("boom"))).toEqual({ ok: false, error: GATEWAY_DOWN });
    expect((await db.select().from(orders))[0].status).toBe("expired");
  });

  it("a successful checkout and an ordinary refusal (no seats) do not alert", async () => {
    const { s } = await setup({ capacity: 3 });
    expect((await startCheckout({ ...valid, sessionId: s.id }, "1.1.1.1", deps())).ok).toBe(true);
    expect(await startCheckout({ ...valid, sessionId: s.id }, "1.1.1.1", deps())).toEqual({ ok: false, error: "Мест не осталось" });
    expect(notifyAlert).not.toHaveBeenCalled();
  });
});

describe("releaseHold", () => {
  it("awaiting_payment becomes expired and frees the seats", async () => {
    const { s } = await setup();
    const r = await startCheckout({ ...valid, sessionId: s.id }, "1.1.1.1", deps());
    if (!r.ok) throw new Error("unreachable");
    expect(await occupiedSeats(db, s.id)).toBe(3);
    await releaseHold(r.orderToken, db);
    expect((await db.select().from(orders))[0].status).toBe("expired");
    expect(8 - (await occupiedSeats(db, s.id))).toBe(8);
  });

  it("does not touch an order in any other status", async () => {
    const { s } = await setup();
    const r = await startCheckout({ ...valid, sessionId: s.id }, "1.1.1.1", deps());
    if (!r.ok) throw new Error("unreachable");
    await db.update(orders).set({ status: "paid" }).where(eq(orders.accessToken, r.orderToken));
    await releaseHold(r.orderToken, db);
    const [o] = await db.select().from(orders);
    expect(o.status).toBe("paid");
    expect(await occupiedSeats(db, s.id)).toBe(3);
  });

  it("an unknown token changes nothing", async () => {
    const { s } = await setup();
    await startCheckout({ ...valid, sessionId: s.id }, "1.1.1.1", deps());
    await releaseHold("no-such-token", db);
    expect((await db.select().from(orders))[0].status).toBe("awaiting_payment");
  });
});
