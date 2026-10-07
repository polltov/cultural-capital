import { describe, it, expect } from "vitest";
import { db } from "@/db/client";
import { orders, tours, tourSessions } from "@/db/schema";
import { countNewOrders, getDashboard } from "@/server/admin-orders";

const DAY = 24 * 3600_000;

async function setup() {
  const [t] = await db.insert(tours).values({ slug: "a", title: "Эрмитаж", durationLabel: "2 часа", ageLabel: "6+", priceChild: 1, priceAdult: 1 }).returning();
  const mk = (offsetDays: number, extra: { hidden?: boolean; capacity?: number } = {}) =>
    db.insert(tourSessions).values({ tourId: t.id, startsAt: new Date(Date.now() + offsetDays * DAY), ...extra }).returning().then((r) => r[0]);
  return { t, mk };
}

type Status = typeof orders.$inferInsert.status;
const order = (sessionId: number, status: Status, children: number, adults: number, extra: Partial<typeof orders.$inferInsert> = {}) => ({
  sessionId, status, children, adults, customerName: "X", phone: "+7", priceChildSnapshot: 1, priceAdultSnapshot: 1, total: 1, consentAt: new Date(), ...extra,
});

describe("getDashboard: ближайшие сеансы", () => {
  it("lists sessions in the next 14 days with the seats taken by confirmed, done and paid orders", async () => {
    const { mk } = await setup();
    const past = await mk(-1);
    const later = await mk(5, { capacity: 10 });
    const soon = await mk(1);
    await mk(3, { hidden: true });
    await mk(15);

    await db.insert(orders).values([
      order(soon.id, "new", 1, 1),
      order(soon.id, "confirmed", 2, 1),
      order(soon.id, "done", 0, 2),
      order(soon.id, "cancelled", 3, 0),
      order(soon.id, "paid", 1, 0),
      order(soon.id, "expired", 2, 0),
      order(past.id, "new", 1, 0),
      order(later.id, "new", 0, 1),
    ]);

    const d = await getDashboard(db);
    expect(d.upcoming).toEqual([
      { sessionId: soon.id, tourTitle: "Эрмитаж", startsAt: soon.startsAt, capacity: 8, taken: 6 },
      { sessionId: later.id, tourTitle: "Эрмитаж", startsAt: later.startsAt, capacity: 10, taken: 0 },
    ]);
  });
});

describe("getDashboard: оплачено за 7 дней", () => {
  it("counts paid and done orders by paid_at within 7 days and sums their totals", async () => {
    const { mk } = await setup();
    const s = await mk(3);
    const ago = (days: number) => new Date(Date.now() - days * DAY);
    await db.insert(orders).values([
      order(s.id, "paid", 1, 0, { total: 1700, paidAt: ago(1) }),
      order(s.id, "paid", 2, 1, { total: 3270, paidAt: ago(6.9) }),
      order(s.id, "done", 0, 2, { total: 2540, paidAt: ago(3) }),
      order(s.id, "paid", 1, 0, { total: 1000, paidAt: ago(8) }), // старше недели
      order(s.id, "cancelled", 1, 0, { total: 500, paidAt: ago(1) }), // возвращён — не в счёт
      order(s.id, "expired", 1, 0, { total: 600, paidAt: ago(1) }),
      order(s.id, "awaiting_payment", 1, 0, { total: 700 }), // ещё не оплачен: paid_at пуст
      order(s.id, "confirmed", 1, 0, { total: 800 }), // старая заявка
      order(s.id, "new", 1, 0, { total: 900 }),
    ]);

    expect((await getDashboard(db)).paid7d).toEqual({ count: 3, sum: 1700 + 3270 + 2540 });
  });

  it("is zero without paid orders", async () => {
    await setup();
    expect((await getDashboard(db)).paid7d).toEqual({ count: 0, sum: 0 });
  });
});

describe("countNewOrders", () => {
  it("counts only legacy «new» orders (menu badge)", async () => {
    const { mk } = await setup();
    const s = await mk(1);
    await db.insert(orders).values([
      order(s.id, "new", 1, 0),
      order(s.id, "new", 0, 1),
      order(s.id, "confirmed", 1, 0),
      order(s.id, "paid", 1, 0),
    ]);
    expect(await countNewOrders(db)).toBe(2);
  });
});
