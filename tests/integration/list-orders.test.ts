import { describe, it, expect } from "vitest";
import { db } from "@/db/client";
import { tours, tourSessions, orders } from "@/db/schema";
import { listOrders, getOrder } from "@/server/admin-orders";
import { setAdminNote } from "@/server/orders";

async function setup() {
  const [t] = await db.insert(tours).values({ slug: "a", title: "A", durationLabel: "2 часа", ageLabel: "6+", priceChild: 1000, priceAdult: 1270, published: true }).returning();
  const [s] = await db.insert(tourSessions).values({ tourId: t.id, startsAt: new Date(Date.now() + 86400_000) }).returning();
  return { t, s };
}
const base = { priceChildSnapshot: 1, priceAdultSnapshot: 1, total: 1, consentAt: new Date(), children: 1, adults: 1 };

describe("listOrders", () => {
  it("filters by status, search and paginates", async () => {
    const { t, s } = await setup();
    await db.insert(orders).values([
      { ...base, sessionId: s.id, customerName: "Анна", phone: "+79111234567", status: "new" },
      { ...base, sessionId: s.id, customerName: "Борис", phone: "+79990000000", status: "confirmed" },
    ]);
    expect((await listOrders({ status: "new" }, db)).rows.map((r) => r.customerName)).toEqual(["Анна"]);
    expect((await listOrders({ status: "all" }, db)).total).toBe(2);
    expect((await listOrders({ status: "all", q: "911123" }, db)).rows.map((r) => r.customerName)).toEqual(["Анна"]);
    expect((await listOrders({ status: "all", q: "89111234567" }, db)).rows.map((r) => r.customerName)).toEqual(["Анна"]);
    expect((await listOrders({ status: "all", q: "+7 (911) 123-45-67" }, db)).rows.map((r) => r.customerName)).toEqual(["Анна"]);
    expect((await listOrders({ status: "all", q: "анна" }, db)).rows).toHaveLength(1);
    expect((await listOrders({ status: "all", q: "%" }, db)).rows).toHaveLength(0);
    expect((await listOrders({ status: "all", tourId: t.id, sessionId: s.id }, db)).total).toBe(2);
    expect((await listOrders({ status: "all", tourId: t.id + 1 }, db)).total).toBe(0);
  });

  it("30 per page, newest first", async () => {
    const { s } = await setup();
    await db.insert(orders).values(Array.from({ length: 35 }, (_, i) => ({ ...base, sessionId: s.id, customerName: `К${i}`, phone: "+79110000000" })));
    const p1 = await listOrders({ status: "all" }, db);
    const p2 = await listOrders({ status: "all", page: 2 }, db);
    expect(p1.total).toBe(35);
    expect(p1.rows).toHaveLength(30);
    expect(p2.rows).toHaveLength(5);
    expect(p1.rows[0].number).toBeGreaterThan(p1.rows[1].number);
  });
});

describe("listOrders: платёжные поля", () => {
  it("returns payment status and refunded amount, filters paid orders", async () => {
    const { s } = await setup();
    await db.insert(orders).values([
      { ...base, sessionId: s.id, customerName: "Анна", phone: "+79111234567", status: "paid", paymentId: "pay-1", paymentStatus: "succeeded", paidAt: new Date() },
      { ...base, sessionId: s.id, customerName: "Борис", phone: "+79990000000", status: "cancelled", paymentId: "pay-2", paymentStatus: "succeeded", refundedAmount: 500 },
      { ...base, sessionId: s.id, customerName: "Вера", phone: "+79990000001", status: "new" },
    ]);
    const { rows } = await listOrders({ status: "all" }, db);
    const by = Object.fromEntries(rows.map((r) => [r.customerName, r]));
    expect(by["Анна"]).toMatchObject({ paymentStatus: "succeeded", refundedAmount: 0 });
    expect(by["Борис"]).toMatchObject({ paymentStatus: "succeeded", refundedAmount: 500 });
    expect(by["Вера"]).toMatchObject({ paymentStatus: null, refundedAmount: 0 });
    expect((await listOrders({ status: "paid" }, db)).rows.map((r) => r.customerName)).toEqual(["Анна"]);
    expect((await listOrders({ status: "awaiting_payment" }, db)).total).toBe(0);
  });
});

describe("getOrder / setAdminNote", () => {
  it("returns detail with session info, null for unknown", async () => {
    const { s } = await setup();
    const [o] = await db.insert(orders).values({ ...base, sessionId: s.id, customerName: "Анна", phone: "+79111234567" }).returning();
    const d = await getOrder(o.id, db);
    expect(d).toMatchObject({ id: o.id, tourTitle: "A", sessionId: s.id, status: "new" });
    expect(d).toMatchObject({ paymentId: null, paymentStatus: null, paidAt: null, refundedAmount: 0, ticketSentAt: null, accessToken: null });
    expect(await getOrder(9999, db)).toBeNull();
    await setAdminNote(o.id, "перезвонить", db);
    expect((await getOrder(o.id, db))!.adminNote).toBe("перезвонить");
  });

  it("returns the payment block fields of an online order", async () => {
    const { s } = await setup();
    const paidAt = new Date(Date.now() - 3600_000);
    const ticketSentAt = new Date(Date.now() - 3000_000);
    const [o] = await db
      .insert(orders)
      .values({
        ...base, sessionId: s.id, customerName: "Анна", phone: "+79111234567", status: "paid", paymentId: "pay-1",
        paymentStatus: "succeeded", paidAt, ticketSentAt, refundedAmount: 0, accessToken: "t".repeat(43),
      })
      .returning();
    expect(await getOrder(o.id, db)).toMatchObject({
      paymentId: "pay-1", paymentStatus: "succeeded", paidAt, ticketSentAt, refundedAmount: 0, accessToken: "t".repeat(43),
    });
  });
});
