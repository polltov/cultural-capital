import { describe, it, expect } from "vitest";
import { db } from "@/db/client";
import { orders, tours, tourSessions } from "@/db/schema";
import { getSourceReport } from "@/server/admin-orders";

const DAY = 24 * 3600_000;

type Insert = typeof orders.$inferInsert;
let seq = 0;

async function session() {
  const [t] = await db.insert(tours).values({ slug: "a", title: "Эрмитаж", durationLabel: "2 часа", ageLabel: "6+", priceChild: 1, priceAdult: 1 }).returning();
  const [s] = await db.insert(tourSessions).values({ tourId: t.id, startsAt: new Date(Date.now() + 3 * DAY) }).returning();
  return s.id;
}

const order = (sessionId: number, status: Insert["status"], total: number, extra: Partial<Insert> = {}): Insert => ({
  sessionId, status, total, children: 1, adults: 1, customerName: "X", phone: "+7", priceChildSnapshot: 1, priceAdultSnapshot: 1,
  consentAt: new Date(), accessToken: `token-${++seq}`, ...extra,
});

describe("getSourceReport", () => {
  it("группирует онлайн-покупки за период по источнику: начато, оплачено, билеты, сумма за вычетом возвратов", async () => {
    const s = await session();
    const vk = { utmSource: "vk", utmMedium: "cpc", utmCampaign: "zima" };
    await db.insert(orders).values([
      order(s, "paid", 3000, vk),
      order(s, "done", 2000, { ...vk, refundedAmount: 500, children: 2, adults: 0 }),
      order(s, "expired", 1000, vk),
      order(s, "cancelled", 4000, { ...vk, refundedAmount: 4000 }),
      order(s, "paid", 1500, { utmSource: "yandex.ru", utmMedium: "organic" }),
      order(s, "paid", 700),
      // вне отчёта: старше 30 дней и старая заявка без онлайн-оплаты
      order(s, "paid", 9999, { ...vk, createdAt: new Date(Date.now() - 31 * DAY) }),
      order(s, "confirmed", 9999, { ...vk, accessToken: null }),
    ]);

    const rows = await getSourceReport(30, db);
    expect(rows).toEqual([
      { source: "vk", medium: "cpc", campaign: "zima", started: 4, paid: 2, tickets: 4, revenue: 4500 },
      { source: "yandex.ru", medium: "organic", campaign: null, started: 1, paid: 1, tickets: 2, revenue: 1500 },
      { source: null, medium: null, campaign: null, started: 1, paid: 1, tickets: 2, revenue: 700 },
    ]);
  });

  it("период ограничивает по дате оформления", async () => {
    const s = await session();
    await db.insert(orders).values([
      order(s, "paid", 100, { utmSource: "vk", createdAt: new Date(Date.now() - 10 * DAY) }),
      order(s, "paid", 200, { utmSource: "vk", createdAt: new Date(Date.now() - 2 * DAY) }),
    ]);
    expect((await getSourceReport(7, db)).map((r) => r.revenue)).toEqual([200]);
    expect((await getSourceReport(30, db)).map((r) => r.revenue)).toEqual([300]);
  });
});
