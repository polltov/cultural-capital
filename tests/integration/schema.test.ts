import { describe, it, expect } from "vitest";
import { db } from "@/db/client";
import { tours, tourSessions, orders, news } from "@/db/schema";

async function seedSession() {
  const [tour] = await db
    .insert(tours)
    .values({ slug: "t1", title: "Тур", durationLabel: "2 часа", ageLabel: "6+", priceChild: 500, priceAdult: 900 })
    .returning();
  const [session] = await db.insert(tourSessions).values({ tourId: tour.id, startsAt: new Date() }).returning();
  return session;
}

const order = (sessionId: number, children: number, adults: number) => ({
  sessionId,
  customerName: "Иван",
  phone: "+79990000000",
  children,
  adults,
  priceChildSnapshot: 500,
  priceAdultSnapshot: 900,
  total: 0,
  consentAt: new Date(),
});

describe("schema constraints", () => {
  it("rejects an order with zero participants", async () => {
    const s = await seedSession();
    await expect(db.insert(orders).values(order(s.id, 0, 0))).rejects.toThrow();
  });

  it("accepts a valid order with defaults", async () => {
    const s = await seedSession();
    const [o] = await db.insert(orders).values(order(s.id, 1, 0)).returning();
    expect(o.status).toBe("new");
    expect(o.number).toBe(1);
    expect(s.capacity).toBe(8);
  });

  it("restricts deleting a session that has orders", async () => {
    const s = await seedSession();
    await db.insert(orders).values(order(s.id, 0, 1));
    await expect(db.delete(tourSessions)).rejects.toThrow();
  });

  it("rejects duplicate news slugs", async () => {
    const v = { slug: "a", title: "A", excerpt: "e", body: "b" };
    await db.insert(news).values(v);
    await expect(db.insert(news).values(v)).rejects.toThrow();
  });
});
