import { describe, it, expect } from "vitest";
import { db } from "@/db/client";
import { tours, tourSessions, orders } from "@/db/schema";
import { getPublishedCatalog } from "@/server/catalog";

const H = 3600_000;
const base = { durationLabel: "2 часа", ageLabel: "6+", priceChild: 1000, priceAdult: 500 };

describe("getPublishedCatalog", () => {
  it("skips unpublished tours, past and hidden sessions", async () => {
    const [pub] = await db.insert(tours).values({ ...base, slug: "a", title: "A", published: true, sortOrder: 2 }).returning();
    const [pub2] = await db.insert(tours).values({ ...base, slug: "c", title: "C", published: true, sortOrder: 1 }).returning();
    const [draft] = await db.insert(tours).values({ ...base, slug: "b", title: "B", published: false }).returning();
    const now = Date.now();
    await db.insert(tourSessions).values([
      { tourId: pub.id, startsAt: new Date(now + 48 * H) },
      { tourId: pub.id, startsAt: new Date(now + 24 * H) },
      { tourId: pub.id, startsAt: new Date(now - 24 * H) },
      { tourId: pub.id, startsAt: new Date(now + 72 * H), hidden: true },
      { tourId: draft.id, startsAt: new Date(now + 24 * H) },
    ]);
    const res = await getPublishedCatalog(db);
    expect(res.map((r) => r.tour.slug)).toEqual([pub2.slug, "a"]);
    expect(res[0].sessions).toEqual([]);
    const s = res[1].sessions;
    expect(s).toHaveLength(2);
    expect(s[0].startsAt.getTime()).toBeLessThan(s[1].startsAt.getTime());
  });

  it("counts free seats from confirmed/done orders only", async () => {
    const [t] = await db.insert(tours).values({ ...base, slug: "a", title: "A", published: true }).returning();
    const [s] = await db.insert(tourSessions).values({ tourId: t.id, startsAt: new Date(Date.now() + 24 * H), capacity: 8 }).returning();
    const o = { sessionId: s.id, customerName: "X", phone: "+79990000000", priceChildSnapshot: 1, priceAdultSnapshot: 1, total: 1, consentAt: new Date() };
    await db.insert(orders).values([
      { ...o, children: 2, adults: 1, status: "confirmed" },
      { ...o, children: 2, adults: 0, status: "new" },
      { ...o, children: 3, adults: 0, status: "cancelled" },
    ]);
    const res = await getPublishedCatalog(db);
    expect(res[0].sessions[0].free).toBe(5);
  });
});
