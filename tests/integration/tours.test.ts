import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { tours, tourSessions, orders } from "@/db/schema";
import { getPublishedCatalog } from "@/server/catalog";
import { saveTour, setTourPublished, reorderTours, saveSession, deleteSession, listAdminTours, getAdminTour } from "@/server/tours";

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

  it("stores meeting point and what to bring and returns them from getAdminTour", async () => {
    const extra = { meetingPoint: "Дворцовая пл., у Александровской колонны", whatToBring: "Удобная обувь" };
    const created = await saveTour({ ...valid, ...extra }, undefined, db);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const [row] = await db.select().from(tours).where(eq(tours.id, created.id));
    expect(row).toMatchObject(extra);
    expect((await getAdminTour(created.id, db))?.tour).toMatchObject(extra);

    const updated = await saveTour({ ...valid, meetingPoint: "У арки Главного штаба", whatToBring: "" }, created.id, db);
    expect(updated).toEqual({ ok: true, id: created.id });
    expect((await getAdminTour(created.id, db))?.tour).toMatchObject({ meetingPoint: "У арки Главного штаба", whatToBring: "" });
  });

  it("defaults meeting point and what to bring to empty strings", async () => {
    const r = await saveTour(valid, undefined, db);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((await getAdminTour(r.id, db))?.tour).toMatchObject({ meetingPoint: "", whatToBring: "" });
  });

  it("limits meeting point to 300 and what to bring to 500 characters", async () => {
    const long = await saveTour({ ...valid, meetingPoint: "x".repeat(301), whatToBring: "y".repeat(501) }, undefined, db);
    expect(long.ok).toBe(false);
    if (!long.ok) {
      expect(long.fieldErrors.meetingPoint).toBe("Не длиннее 300 символов");
      expect(long.fieldErrors.whatToBring).toBe("Не длиннее 500 символов");
    }
    const edge = await saveTour({ ...valid, meetingPoint: "x".repeat(300), whatToBring: "y".repeat(500) }, undefined, db);
    expect(edge.ok).toBe(true);
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

  it("refuses to lower capacity below occupied seats", async () => {
    const t = await mkTour("a");
    const [s] = await db.insert(tourSessions).values({ tourId: t.id, startsAt: startsAt(), capacity: 8 }).returning();
    await db.insert(orders).values([
      { ...orderBase, sessionId: s.id, children: 2, adults: 1, status: "confirmed" },
      { ...orderBase, sessionId: s.id, children: 0, adults: 5, status: "new" },
    ]);
    const r = await saveSession({ id: s.id, tourId: t.id, startsAt: "2030-05-10T12:30", capacity: 2, hidden: false }, db);
    expect(r).toEqual({ ok: false, error: "Уже занято 3 места (оплачено, подтверждено или ждёт оплаты) — лимит не может быть меньше" });
    const ok = await saveSession({ id: s.id, tourId: t.id, startsAt: "2030-05-10T12:30", capacity: 3, hidden: true }, db);
    expect(ok).toMatchObject({ ok: true });
    const [row] = await db.select().from(tourSessions).where(eq(tourSessions.id, s.id));
    expect(row.capacity).toBe(3);
    expect(row.hidden).toBe(true);
  });

  it("counts paid orders and active holds (not expired ones) in the capacity error", async () => {
    const t = await mkTour("a");
    const [s] = await db.insert(tourSessions).values({ tourId: t.id, startsAt: startsAt(), capacity: 8 }).returning();
    await db.insert(orders).values([
      { ...orderBase, sessionId: s.id, children: 0, adults: 1, status: "paid" },
      { ...orderBase, sessionId: s.id, children: 2, adults: 2, status: "awaiting_payment", holdExpiresAt: new Date(Date.now() + 10 * 60_000) },
      { ...orderBase, sessionId: s.id, children: 0, adults: 9, status: "awaiting_payment", holdExpiresAt: new Date(Date.now() - 60_000) },
    ]);
    const r = await saveSession({ id: s.id, tourId: t.id, startsAt: "2030-05-10T12:30", capacity: 4, hidden: false }, db);
    expect(r).toEqual({ ok: false, error: "Уже занято 5 мест (оплачено, подтверждено или ждёт оплаты) — лимит не может быть меньше" });
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
