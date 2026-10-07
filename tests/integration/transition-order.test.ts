import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { tours, tourSessions, orders } from "@/db/schema";
import { transitionOrder, occupiedSeats } from "@/server/orders";

async function setup(capacity = 8, startsAt = new Date(Date.now() + 86400_000)) {
  const [t] = await db.insert(tours).values({ slug: "a", title: "A", durationLabel: "2 часа", ageLabel: "6+", priceChild: 1000, priceAdult: 1270, published: true }).returning();
  const [s] = await db.insert(tourSessions).values({ tourId: t.id, startsAt, capacity }).returning();
  return s;
}
async function mk(sessionId: number, o: { children?: number; adults?: number; status?: "new" | "confirmed" | "done" | "cancelled" | "paid" } = {}) {
  const [r] = await db.insert(orders).values({
    sessionId, customerName: "Анна", phone: "+79111234567", priceChildSnapshot: 1, priceAdultSnapshot: 1, total: 1,
    consentAt: new Date(), children: o.children ?? 1, adults: o.adults ?? 1, status: o.status ?? "new",
  }).returning();
  return r;
}
const status = async (id: number) => (await db.select().from(orders).where(eq(orders.id, id)))[0].status;

describe("transitionOrder", () => {
  it("confirms when seats suffice and takes them", async () => {
    const s = await setup();
    const o = await mk(s.id, { children: 2, adults: 1 });
    expect(await transitionOrder(o.id, "confirmed", db)).toEqual({ ok: true });
    expect(await status(o.id)).toBe("confirmed");
    expect(s.capacity - (await occupiedSeats(db, s.id))).toBe(5);
  });

  it("refuses to confirm over the limit", async () => {
    const s = await setup(4);
    await mk(s.id, { children: 3, adults: 0, status: "confirmed" });
    const o = await mk(s.id, { children: 2, adults: 1 });
    expect(await transitionOrder(o.id, "confirmed", db)).toEqual({ ok: false, error: "Свободно 1, в заявке 3 — увеличьте лимит или отмените" });
    expect(await status(o.id)).toBe("new");
  });

  it("cancelling a confirmed order frees seats", async () => {
    const s = await setup();
    const o = await mk(s.id, { children: 2, adults: 2, status: "confirmed" });
    expect(await occupiedSeats(db, s.id)).toBe(4);
    expect(await transitionOrder(o.id, "cancelled", db)).toEqual({ ok: true });
    expect(await occupiedSeats(db, s.id)).toBe(0);
  });

  it("rejects done→new with a Russian message", async () => {
    const s = await setup();
    const o = await mk(s.id, { status: "done" });
    expect(await transitionOrder(o.id, "new", db)).toEqual({ ok: false, error: "Нельзя перевести заявку из «Проведён» в «Новая заявка»" });
    expect(await status(o.id)).toBe("done");
  });

  it("reports a missing order", async () => {
    expect((await transitionOrder(9999, "confirmed", db)).ok).toBe(false);
  });

  it("sets updatedAt", async () => {
    const s = await setup();
    const o = await mk(s.id);
    await db.update(orders).set({ updatedAt: new Date(0) }).where(eq(orders.id, o.id));
    await transitionOrder(o.id, "cancelled", db);
    const [r] = await db.select().from(orders).where(eq(orders.id, o.id));
    expect(r.updatedAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it("paid → done is refused before the excursion has started", async () => {
    const s = await setup(8, new Date(Date.now() + 3600_000));
    const o = await mk(s.id, { status: "paid" });
    expect(await transitionOrder(o.id, "done", db)).toEqual({ ok: false, error: "Отметить проведённым можно только после начала экскурсии" });
    expect(await status(o.id)).toBe("paid");
  });

  it("paid → done is allowed once the excursion has started", async () => {
    const s = await setup(8, new Date(Date.now() - 60_000));
    const o = await mk(s.id, { status: "paid" });
    expect(await transitionOrder(o.id, "done", db)).toEqual({ ok: true });
    expect(await status(o.id)).toBe("done");
  });

  it("old applications: confirmed → done is not restricted by the start time", async () => {
    const s = await setup();
    const o = await mk(s.id, { status: "confirmed" });
    expect(await transitionOrder(o.id, "done", db)).toEqual({ ok: true });
  });

  it("race: two confirmations for the last 3 seats → exactly one ok", async () => {
    const s = await setup(3);
    const a = await mk(s.id, { children: 2, adults: 1 });
    const b = await mk(s.id, { children: 1, adults: 2 });
    const res = await Promise.all([transitionOrder(a.id, "confirmed", db), transitionOrder(b.id, "confirmed", db)]);
    expect(res.filter((r) => r.ok)).toHaveLength(1);
    expect(await occupiedSeats(db, s.id)).toBe(3);
  });
});
