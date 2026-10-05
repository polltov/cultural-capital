import { describe, it, expect } from "vitest";
import { db } from "@/db/client";
import { tours, tourSessions, orders } from "@/db/schema";
import { getSessionRoster } from "@/server/admin-orders";

const base = { priceChildSnapshot: 1, priceAdultSnapshot: 1, total: 100, consentAt: new Date(), phone: "+79111234567" };

describe("getSessionRoster", () => {
  it("only confirmed/done, correct totals", async () => {
    const [t] = await db.insert(tours).values({ slug: "a", title: "Прогулка", durationLabel: "2 часа", ageLabel: "6+", priceChild: 1, priceAdult: 1, published: true }).returning();
    const [s] = await db.insert(tourSessions).values({ tourId: t.id, startsAt: new Date(Date.now() + 86400_000) }).returning();
    await db.insert(orders).values([
      { ...base, sessionId: s.id, customerName: "Новая", children: 5, adults: 5, status: "new" },
      { ...base, sessionId: s.id, customerName: "Отм", children: 4, adults: 4, status: "cancelled" },
      { ...base, sessionId: s.id, customerName: "Подтв", children: 2, adults: 1, status: "confirmed", adminNote: "рядом" },
      { ...base, sessionId: s.id, customerName: "Прош", children: 1, adults: 1, status: "done" },
    ]);
    const r = await getSessionRoster(s.id, db);
    expect(r!.session.tourTitle).toBe("Прогулка");
    expect(r!.session.capacity).toBe(8);
    expect(r!.rows.map((x) => x.name)).toEqual(["Подтв", "Прош"]);
    expect(r!.rows[0]).toMatchObject({ number: expect.stringMatching(/^КС-\d{4}$/), children: 2, adults: 1, total: 100, adminNote: "рядом" });
    expect(r!.rows[1].adminNote).toBeNull();
    expect(r!.totals).toEqual({ children: 3, adults: 2 });
  });
  it("null for missing or out-of-range id", async () => {
    expect(await getSessionRoster(999, db)).toBeNull();
    expect(await getSessionRoster(2 ** 40, db)).toBeNull();
    expect(await getSessionRoster(-1, db)).toBeNull();
  });
});
