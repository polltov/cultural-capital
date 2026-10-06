import { describe, it, expect } from "vitest";
import { db } from "@/db/client";
import { tours, tourSessions, orders } from "@/db/schema";
import { getPublishedCatalog } from "@/server/catalog";
import { getSessionRoster } from "@/server/admin-orders";
import { occupiedSeats } from "@/server/orders";
import { saveSession } from "@/server/tours";

const MIN = 60_000;
const H = 3600_000;
const base = { phone: "+79111234567", priceChildSnapshot: 1000, priceAdultSnapshot: 1270, total: 100, consentAt: new Date() };

async function setup(capacity = 8) {
  const [t] = await db.insert(tours).values({ slug: "a", title: "A", durationLabel: "2 часа", ageLabel: "6+", priceChild: 1000, priceAdult: 1270, published: true }).returning();
  const [s] = await db.insert(tourSessions).values({ tourId: t.id, startsAt: new Date(Date.now() + 24 * H), capacity }).returning();
  return { t, s };
}

describe("seats with payment holds", () => {
  it("active hold takes seats, expired hold does not", async () => {
    const { s } = await setup(8);
    await db.insert(orders).values([
      { ...base, sessionId: s.id, customerName: "Активный", children: 3, adults: 0, status: "awaiting_payment", holdExpiresAt: new Date(Date.now() + 10 * MIN) },
      { ...base, sessionId: s.id, customerName: "Просроченный", children: 2, adults: 0, status: "awaiting_payment", holdExpiresAt: new Date(Date.now() - MIN) },
    ]);
    expect((await getPublishedCatalog(db))[0].sessions[0].free).toBe(5);
    expect(await occupiedSeats(db, s.id)).toBe(3);
  });

  it("awaiting_payment without hold_expires_at takes no seats", async () => {
    const { s } = await setup(8);
    await db.insert(orders).values({ ...base, sessionId: s.id, customerName: "Без срока", children: 4, adults: 0, status: "awaiting_payment" });
    expect(await occupiedSeats(db, s.id)).toBe(0);
  });

  it("paid takes seats, expired/cancelled do not", async () => {
    const { s } = await setup(8);
    await db.insert(orders).values([
      { ...base, sessionId: s.id, customerName: "Оплачен", children: 2, adults: 0, status: "paid" },
      { ...base, sessionId: s.id, customerName: "Не оплачен", children: 3, adults: 0, status: "expired" },
      { ...base, sessionId: s.id, customerName: "Отменён", children: 1, adults: 0, status: "cancelled" },
    ]);
    expect((await getPublishedCatalog(db))[0].sessions[0].free).toBe(6);
    expect(await occupiedSeats(db, s.id)).toBe(2);
  });

  it("cannot lower capacity below paid + active holds", async () => {
    const { t, s } = await setup(8);
    await db.insert(orders).values([
      { ...base, sessionId: s.id, customerName: "Оплачен", children: 3, adults: 0, status: "paid" },
      { ...base, sessionId: s.id, customerName: "Удержание", children: 2, adults: 0, status: "awaiting_payment", holdExpiresAt: new Date(Date.now() + 10 * MIN) },
    ]);
    const startsAt = "2099-01-01T10:00";
    const tooLow = await saveSession({ id: s.id, tourId: t.id, startsAt, capacity: 4, hidden: false }, db);
    expect(tooLow.ok).toBe(false);
    const exact = await saveSession({ id: s.id, tourId: t.id, startsAt, capacity: 5, hidden: false }, db);
    expect(exact.ok).toBe(true);
  });

  it("roster lists paid orders, not holds", async () => {
    const { s } = await setup(8);
    await db.insert(orders).values([
      { ...base, sessionId: s.id, customerName: "Анна", children: 2, adults: 1, status: "paid" },
      { ...base, sessionId: s.id, customerName: "Борис", children: 1, adults: 1, status: "awaiting_payment", holdExpiresAt: new Date(Date.now() + 10 * MIN) },
    ]);
    const r = await getSessionRoster(s.id, db);
    expect(r!.rows.map((x) => x.name)).toEqual(["Анна"]);
    expect(r!.totals).toEqual({ children: 2, adults: 1 });
  });
});
