import { eq } from "drizzle-orm";
import type { Db } from "./client";
import { tours, tourSessions } from "./schema";
import { SEED_TOURS } from "./seed-data";
import { parseMoscowLocal } from "../lib/domain/moscow-time";
import { slugify } from "../lib/domain/slug";

/** Idempotent: upserts tours by slug; inserts sessions only for tours that have none. */
export async function seed(db: Db): Promise<void> {
  for (const [i, { sessions, ...t }] of SEED_TOURS.entries()) {
    const values = { ...t, slug: slugify(t.title), sortOrder: i, published: true };
    const { slug: _slug, ...update } = values;
    const [row] = await db
      .insert(tours)
      .values(values)
      .onConflictDoUpdate({ target: tours.slug, set: { ...update, updatedAt: new Date() } })
      .returning({ id: tours.id });
    const existing = await db.select({ id: tourSessions.id }).from(tourSessions).where(eq(tourSessions.tourId, row.id)).limit(1);
    if (existing.length === 0) {
      await db.insert(tourSessions).values(
        sessions.map((s) => ({ tourId: row.id, startsAt: parseMoscowLocal(s), capacity: 8 })),
      );
    }
  }
}
