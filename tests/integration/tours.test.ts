import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { tours, tourSessions, orders } from "@/db/schema";
import { getPublishedCatalog } from "@/server/catalog";
import { saveTour, setTourPublished, reorderTours, saveSession, deleteSession, listAdminTours } from "@/server/tours";

const H = 3600_000;
const valid = { title: "Дворцовая площадь", subtitle: "", route: "", description: "", note: "", durationLabel: "2 часа", ageLabel: "6+", priceChild: 1000, priceAdult: 1500, featured: false, coverUrl: null };
const base = { durationLabel: "2 часа", ageLabel: "6+", priceChild: 1000, priceAdult: 500 };
const startsAt = () => new Date(Date.now() + 48 * H);
const orderBase = { customerName: "X", phone: "+79990000000", priceChildSnapshot: 1, priceAdultSnapshot: 1, total: 1, consentAt: new Date() };

async function mkTour(slug: string, sortOrder = 0) {
  const [t] = await db.insert(tours).values({ ...base, slug, title: slug, published: true, sortOrder }).returning();
  return t;
}

describe("saveTour", () => {
  it("returns fieldErrors.title for a missing title", async () => {
    const r = await saveTour({ ...valid, title: "" }, undefined, db);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors.title).toBeTruthy();
  });

  it("validates prices and lengths", async () => {
    const r = await saveTour({ ...valid, priceChild: -1, ageLabel: "x".repeat(11) }, undefined, db);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fieldErrors.priceChild).toBeTruthy();
      expect(r.fieldErrors.ageLabel).toBeTruthy();
    }
  });

  it("creates with generated unique slug, unpublished, appended to the end", async () => {
    const a = await saveTour(valid, undefined, db);
    const b = await saveTour(valid, undefined, db);
    expect(a.ok && b.ok).toBe(true);
    const rows = await db.select().from(tours).orderBy(tours.id);
    expect(rows.map((r) => r.slug)).toEqual(["dvortsovaya-ploshchad", "dvortsovaya-ploshchad-2"]);
    expect(rows.every((r) => !r.published)).toBe(true);
    expect(rows[1].sortOrder).toBeGreaterThan(rows[0].sortOrder);
  });

  it("updates an existing tour without touching slug/published and sets updatedAt", async () => {
    const t = await mkTour("a");
    await db.update(tours).set({ updatedAt: new Date(0) }).where(eq(tours.id, t.id));
    const r = await saveTour({ ...valid, title: "Новое имя" }, t.id, db);
    expect(r).toEqual({ ok: true, id: t.id });
    const [row] = await db.select().from(tours).where(eq(tours.id, t.id));
    expect(row.title).toBe("Новое имя");
    expect(row.slug).toBe("a");
    expect(row.published).toBe(true);
    expect(row.updatedAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it("reports a missing tour on update", async () => {
    const r = await saveTour(valid, 99999, db);
    expect(r.ok).toBe(false);
  });
});

describe("setTourPublished / reorderTours", () => {
  it("toggles publication", async () => {
    const t = await mkTour("a");
    await setTourPublished(t.id, false, db);
    expect(await getPublishedCatalog(db)).toEqual([]);
    await setTourPublished(t.id, true, db);
    expect(await getPublishedCatalog(db)).toHaveLength(1);
  });

  it("reorders so the catalog follows the new order", async () => {
    const a = await mkTour("a", 0);
    const b = await mkTour("b", 1);
    const c = await mkTour("c", 2);
    const r = await reorderTours([c.id, a.id, b.id], db);
    expect(r.ok).toBe(true);
    expect((await getPublishedCatalog(db)).map((x) => x.tour.slug)).toEqual(["c", "a", "b"]);
  });

  it("rejects ids that are not a permutation of existing tours", async () => {
    const a = await mkTour("a", 0);
    const b = await mkTour("b", 1);
    expect((await reorderTours([a.id], db)).ok).toBe(false);
    expect((await reorderTours([a.id, a.id], db)).ok).toBe(false);
    expect((await reorderTours([a.id, 9999], db)).ok).toBe(false);
    expect((await listAdminTours(db)).map((x) => x.id)).toEqual([a.id, b.id]);
  });
});

describe("saveSession", () => {
  it("creates a session with default-able capacity and Moscow time", async () => {
    const t = await mkTour("a");
    const r = await saveSession({ tourId: t.id, startsAt: "2030-05-10T12:30", capacity: 8, hidden: false }, db);
    expect(r).toMatchObject({ ok: true });
    const [s] = await db.select().from(tourSessions);
    expect(s.startsAt.toISOString()).toBe("2030-05-10T09:30:00.000Z");
  });

  it("validates capacity range and date", async () => {
    const t = await mkTour("a");
    expect((await saveSession({ tourId: t.id, startsAt: "2030-05-10T12:30", capacity: 0, hidden: false }, db)).ok).toBe(false);
    expect((await saveSession({ tourId: t.id, startsAt: "2030-05-10T12:30", capacity: 101, hidden: false }, db)).ok).toBe(false);
    expect((await saveSession({ tourId: t.id, startsAt: "2030-13-45T12:30", capacity: 8, hidden: false }, db)).ok).toBe(false);
    expect((await saveSession({ tourId: t.id, startsAt: "nonsense", capacity: 8, hidden: false }, db)).ok).toBe(false);
    expect((await saveSession({ tourId: 9999, startsAt: "2030-05-10T12:30", capacity: 8, hidden: false }, db)).ok).toBe(false);
  });

  it("refuses to lower capacity below confirmed+done seats", async () => {
    const t = await mkTour("a");
    const [s] = await db.insert(tourSessions).values({ tourId: t.id, startsAt: startsAt(), capacity: 8 }).returning();
    await db.insert(orders).values([
      { ...orderBase, sessionId: s.id, children: 2, adults: 1, status: "confirmed" },
      { ...orderBase, sessionId: s.id, children: 0, adults: 5, status: "new" },
    ]);
    const r = await saveSession({ id: s.id, tourId: t.id, startsAt: "2030-05-10T12:30", capacity: 2, hidden: false }, db);
    expect(r).toEqual({ ok: false, error: "Уже подтверждено 3 человек — лимит не может быть меньше" });
    const ok = await saveSession({ id: s.id, tourId: t.id, startsAt: "2030-05-10T12:30", capacity: 3, hidden: true }, db);
    expect(ok).toMatchObject({ ok: true });
    const [row] = await db.select().from(tourSessions).where(eq(tourSessions.id, s.id));
    expect(row.capacity).toBe(3);
    expect(row.hidden).toBe(true);
  });

  it("hidden sessions disappear from the catalog", async () => {
    const t = await mkTour("a");
    const [s] = await db.insert(tourSessions).values({ tourId: t.id, startsAt: startsAt() }).returning();
    expect((await getPublishedCatalog(db))[0].sessions).toHaveLength(1);
    await saveSession({ id: s.id, tourId: t.id, startsAt: "2030-05-10T12:30", capacity: 8, hidden: true }, db);
    expect((await getPublishedCatalog(db))[0].sessions).toHaveLength(0);
  });

  it("rejects an existing session id belonging to another tour", async () => {
    const a = await mkTour("a");
    const b = await mkTour("b");
    const [s] = await db.insert(tourSessions).values({ tourId: a.id, startsAt: startsAt() }).returning();
    const r = await saveSession({ id: s.id, tourId: b.id, startsAt: "2030-05-10T12:30", capacity: 8, hidden: false }, db);
    expect(r.ok).toBe(false);
  });
});

describe("deleteSession", () => {
  it("blocks deletion when any order exists, even cancelled", async () => {
    const t = await mkTour("a");
    const [s] = await db.insert(tourSessions).values({ tourId: t.id, startsAt: startsAt() }).returning();
    await db.insert(orders).values({ ...orderBase, sessionId: s.id, children: 1, adults: 0, status: "cancelled" });
    const r = await deleteSession(s.id, db);
    expect(r).toEqual({ ok: false, error: "На сеанс есть заявки — его можно только скрыть" });
    expect(await db.select().from(tourSessions)).toHaveLength(1);
  });

  it("deletes a session without orders", async () => {
    const t = await mkTour("a");
    const [s] = await db.insert(tourSessions).values({ tourId: t.id, startsAt: startsAt() }).returning();
    expect(await deleteSession(s.id, db)).toEqual({ ok: true });
    expect(await db.select().from(tourSessions)).toHaveLength(0);
  });
});
