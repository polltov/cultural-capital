import { describe, it, expect } from "vitest";
import { db } from "@/db/client";
import { rateLimitHits } from "@/db/schema";
import { hitRateLimit, clearRateLimit, recordRateLimit } from "@/server/rate-limit";

describe("rate limit", () => {
  it("blocks after limit and clears", async () => {
    for (let i = 0; i < 3; i++) expect(await hitRateLimit("k", 3, 60, db)).toBe(true);
    expect(await hitRateLimit("k", 3, 60, db)).toBe(false);
    expect(await hitRateLimit("other", 3, 60, db)).toBe(true);
    await clearRateLimit("k", db);
    expect(await hitRateLimit("k", 3, 60, db)).toBe(true);
  });

  it("purges hits older than a day when recording", async () => {
    await db.insert(rateLimitHits).values({ key: "old", createdAt: new Date(Date.now() - 25 * 3600 * 1000) });
    await recordRateLimit("fresh", db);
    const keys = (await db.select({ key: rateLimitHits.key }).from(rateLimitHits)).map((r) => r.key);
    expect(keys).not.toContain("old");
    expect(keys).toContain("fresh");
  });
});
