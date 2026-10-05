import { and, eq, gt, sql } from "drizzle-orm";
import { db as sharedDb, type Db } from "@/db/client";
import { rateLimitHits } from "@/db/schema";

/** Number of hits recorded for `key` within the last `windowSec` seconds. */
export async function countRateLimit(key: string, windowSec: number, db: Db = sharedDb): Promise<number> {
  const since = new Date(Date.now() - windowSec * 1000);
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(rateLimitHits)
    .where(and(eq(rateLimitHits.key, key), gt(rateLimitHits.createdAt, since)));
  return n;
}

export async function recordRateLimit(key: string, db: Db = sharedDb): Promise<void> {
  await db.insert(rateLimitHits).values({ key });
}

/** Records a hit; returns false (and records nothing extra) if the limit in the window is already reached. */
export async function hitRateLimit(key: string, limit: number, windowSec: number, db: Db = sharedDb): Promise<boolean> {
  if ((await countRateLimit(key, windowSec, db)) >= limit) return false;
  await recordRateLimit(key, db);
  return true;
}

export async function clearRateLimit(key: string, db: Db = sharedDb): Promise<void> {
  await db.delete(rateLimitHits).where(eq(rateLimitHits.key, key));
}
