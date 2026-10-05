import { describe, it, expect } from "vitest";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { tours, tourSessions } from "@/db/schema";
import { seed } from "@/db/seed";

describe("seed", () => {
  it("is idempotent and seeds the 4 tours", async () => {
    await seed(db);
    await seed(db);
    const all = await db.select().from(tours).orderBy(asc(tours.sortOrder));
    expect(all).toHaveLength(4);
    expect(all.every((t) => t.published)).toBe(true);

    const egypt = all.find((t) => t.title === "Египетский зал Эрмитажа")!;
    expect(egypt.priceChild).toBe(1390);
    expect(egypt.priceAdult).toBe(490);
    expect(egypt.featured).toBe(true);
    const sessions = await db.select().from(tourSessions)
      .where(eq(tourSessions.tourId, egypt.id)).orderBy(asc(tourSessions.startsAt));
    expect(sessions.map((s) => s.startsAt.toISOString())).toEqual([
      "2026-09-20T08:00:00.000Z",
      "2026-10-04T08:00:00.000Z",
    ]);
    expect(sessions.every((s) => s.capacity === 8)).toBe(true);

    const fort = all.find((t) => t.title === "Тайна первой крепости")!;
    expect(fort.priceChild).toBe(2200);
    expect(fort.priceAdult).toBe(2200);
    expect(await db.select().from(tourSessions)).toHaveLength(5);
  });
});
