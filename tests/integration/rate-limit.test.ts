import { describe, it, expect } from "vitest";
import { db } from "@/db/client";
import { hitRateLimit, clearRateLimit } from "@/server/rate-limit";

describe("rate limit", () => {
  it("blocks after limit and clears", async () => {
    for (let i = 0; i < 3; i++) expect(await hitRateLimit("k", 3, 60, db)).toBe(true);
    expect(await hitRateLimit("k", 3, 60, db)).toBe(false);
    expect(await hitRateLimit("other", 3, 60, db)).toBe(true);
    await clearRateLimit("k", db);
    expect(await hitRateLimit("k", 3, 60, db)).toBe(true);
  });
});
