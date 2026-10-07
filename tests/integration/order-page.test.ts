import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, tours, tourSessions } from "@/db/schema";
import { releaseHold, startCheckout } from "@/server/checkout";
import { loadOrderPage } from "@/server/order-page";
import { fakeGateway, type FakeGateway } from "../support/fake-gateway";

const H = 3600_000;
const valid = { children: 2, adults: 1, name: "Анна", phone: "8 (999) 123-45-67", email: "anna@example.com", consent: true, website: "" };

let gw: FakeGateway;
let seq = 0;

beforeEach(() => {
  gw = fakeGateway();
  seq = 0;
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

async function setup() {
  const [t] = await db.insert(tours).values({
    slug: `t${++seq}`, title: "Эрмитаж", durationLabel: "2 часа", ageLabel: "6+", priceChild: 1000, priceAdult: 1270, published: true,
    meetingPoint: "У главного входа", whatToBring: "Вода",
  }).returning();
  const [s] = await db.insert(tourSessions).values({ tourId: t.id, startsAt: new Date(Date.now() + 48 * H), capacity: 8 }).returning();
  return s;
}

/** Заказ через startCheckout: `awaiting_payment`, платёж pay-N в подделке шлюза (статус pending). */
async function buy() {
  const s = await setup();
  const r = await startCheckout({ ...valid, sessionId: s.id }, `10.0.0.${seq}`, { db, gateway: gw });
  if (!r.ok) throw new Error(`startCheckout: ${JSON.stringify(r)}`);
  const [o] = await db.select().from(orders).where(eq(orders.accessToken, r.orderToken));
  return { token: r.orderToken, orderId: o.id, paymentId: o.paymentId! };
}

const setOrder = (orderId: number, v: Partial<typeof orders.$inferInsert>) => db.update(orders).set(v).where(eq(orders.id, orderId));
const load = (token: string) => loadOrderPage(token, { db, gateway: gw });
/** Без шлюза в deps: страница сама берёт настоящий (по env), а он не настроен. */
const loadDefaultGateway = (token: string) => loadOrderPage(token, { db });

describe("loadOrderPage: синк при открытии", () => {
  it("ждёт оплаты, а в шлюзе уже succeeded → билет и исход paid", async () => {
    const { token, orderId, paymentId } = await buy();
    gw.setStatus(paymentId, "succeeded");

    const page = await load(token);

    expect(page?.data.view).toBe("paid");
    expect(page?.outcome).toEqual({ kind: "paid", orderId });
    expect(page?.data.ticket).toMatchObject({ orderId, tourTitle: "Эрмитаж", children: 2, adults: 1, total: 3270, meetingPoint: "У главного входа" });
    expect(page?.data.refunded).toBe(0);
    expect((await db.select().from(orders).where(eq(orders.id, orderId)))[0].status).toBe("paid");
  });

  it("платёж ещё не прошёл → «ждёт оплаты», шлюз опрошен один раз", async () => {
    const { token } = await buy();
    const spy = vi.spyOn(gw, "getPayment");

    const page = await load(token);

    expect(page?.data.view).toBe("awaiting");
    expect(page?.outcome?.kind).toBe("noop");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("платёж отменён в ЮKassa (карту отклонили) → «оплата не прошла»", async () => {
    const { token, orderId, paymentId } = await buy();
    gw.setStatus(paymentId, "canceled");

    const page = await load(token);

    expect(page?.data.view).toBe("declined");
    expect(page?.outcome).toEqual({ kind: "expired", orderId });
  });

  it("(Review Focus 4) оплаченный заказ: шлюз не вызывается ни разу, исхода нет", async () => {
    const { token, paymentId } = await buy();
    gw.setStatus(paymentId, "succeeded");
    await load(token); // первое открытие переводит заказ в paid
    const spy = vi.spyOn(gw, "getPayment");

    for (let i = 0; i < 3; i++) {
      const page = await load(token);
      expect(page?.data.view).toBe("paid");
      expect(page?.outcome).toBeNull();
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it("ждёт оплаты, но paymentId ещё нет → шлюз не вызывается", async () => {
    const { token, orderId } = await buy();
    await setOrder(orderId, { paymentId: null });
    const spy = vi.spyOn(gw, "getPayment");

    const page = await load(token);

    expect(page?.data.view).toBe("awaiting");
    expect(page?.outcome).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("loadOrderPage: заказ снят с удержания, а платёж ещё не завершён", () => {
  it("клиент нажал «Изменить», но всё же оплатил (webhook не дошёл) → синк, поздняя оплата, билет", async () => {
    const { token, orderId, paymentId } = await buy();
    await releaseHold(token, db);
    gw.setStatus(paymentId, "succeeded");

    const page = await load(token);

    expect(page?.outcome).toEqual({ kind: "late_paid", orderId });
    expect(page?.data.view).toBe("paid");
  });

  it("платёж ещё не завершён — шлюз спрашиваем, страница «не оплачен»", async () => {
    const { token } = await buy();
    await releaseHold(token, db);
    const spy = vi.spyOn(gw, "getPayment");

    const page = await load(token);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(page?.outcome?.kind).toBe("noop");
    expect(page?.data.view).toBe("expired");
  });

  it("статус платежа ещё не записан (null) — тоже спрашиваем", async () => {
    const { token, orderId } = await buy();
    await setOrder(orderId, { status: "expired", paymentStatus: null });
    const spy = vi.spyOn(gw, "getPayment");

    await load(token);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it.each(["canceled", "succeeded"])("платёж в конечном статусе %s — шлюз не трогаем", async (paymentStatus) => {
    const { token, orderId } = await buy();
    await setOrder(orderId, { status: "expired", paymentStatus });
    const spy = vi.spyOn(gw, "getPayment");

    const page = await load(token);

    expect(spy).not.toHaveBeenCalled();
    expect(page?.outcome).toBeNull();
  });
});

describe("loadOrderPage: сбой шлюза", () => {
  it("getPayment упал → страница с текущим состоянием, а не ошибка; токен в лог не попадает", async () => {
    const { token } = await buy();
    gw.failNext("getPayment");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const page = await load(token);

    expect(page?.data.view).toBe("awaiting");
    expect(page?.outcome).toBeNull();
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.mock.calls)).not.toContain(token);
  });

  it("ЮKassa не настроена: оплаченный заказ открывается без шлюза, ждущий — в текущем состоянии", async () => {
    vi.stubEnv("YOOKASSA_SHOP_ID", "");
    vi.stubEnv("YOOKASSA_SECRET_KEY", "");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const paid = await buy();
    await setOrder(paid.orderId, { status: "paid" });
    const awaiting = await buy();

    expect((await loadDefaultGateway(paid.token))?.data.view).toBe("paid");
    expect(log).not.toHaveBeenCalled();

    expect((await loadDefaultGateway(awaiting.token))?.data.view).toBe("awaiting");
    expect(log).toHaveBeenCalledTimes(1);
  });
});

describe("loadOrderPage: «не оплачен» или «оплата не прошла»", () => {
  it("expired с отменённым платежом → declined, без запроса к шлюзу", async () => {
    const { token, orderId } = await buy();
    await setOrder(orderId, { status: "expired", paymentStatus: "canceled" });
    const spy = vi.spyOn(gw, "getPayment");

    expect((await load(token))?.data.view).toBe("declined");
    expect(spy).not.toHaveBeenCalled();
  });

  it("expired, платёж ещё не завершён или его нет → «время истекло»", async () => {
    const a = await buy();
    const b = await buy();
    await releaseHold(a.token, db); // платёж pending
    await setOrder(b.orderId, { status: "expired", paymentId: null, paymentStatus: null });

    expect((await load(a.token))?.data.view).toBe("expired");
    expect((await load(b.token))?.data.view).toBe("expired");
  });
});

describe("loadOrderPage: статусы и токены", () => {
  it("done → билет, expired → «не оплачен», cancelled → «отменён» с суммой возврата", async () => {
    const a = await buy();
    const b = await buy();
    const c = await buy();
    await setOrder(a.orderId, { status: "done" });
    await setOrder(b.orderId, { status: "expired" });
    await setOrder(c.orderId, { status: "cancelled", refundedAmount: 1635 });

    expect((await load(a.token))?.data.view).toBe("paid");
    expect((await load(b.token))?.data.view).toBe("expired");
    const cancelled = await load(c.token);
    expect(cancelled?.data).toMatchObject({ view: "cancelled", refunded: 1635 });
    expect(cancelled?.outcome).toBeNull();
  });

  it("старые статусы (new / confirmed) страницы не имеют, даже если токен каким-то образом есть", async () => {
    const a = await buy();
    const b = await buy();
    await setOrder(a.orderId, { status: "new" });
    await setOrder(b.orderId, { status: "confirmed" });

    expect(await load(a.token)).toBeNull();
    expect(await load(b.token)).toBeNull();
  });

  it("мусорный и несуществующий токен → null, шлюз и база не нужны", async () => {
    const spy = vi.spyOn(gw, "getPayment");
    for (const bad of ["", "abc", "x".repeat(42), "x".repeat(44), `${"a".repeat(42)}=`, `${"a".repeat(42)} `, "../".repeat(15)]) {
      expect(await load(bad)).toBeNull();
    }
    expect(await load("A".repeat(43))).toBeNull(); // верная форма, но такого заказа нет
    expect(spy).not.toHaveBeenCalled();
  });
});
