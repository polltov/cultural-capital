import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { news } from "@/db/schema";
import {
  saveNews, setNewsPublished, getLatestNews, listPublishedNews, getNewsBySlug, listAllNews, getAdminNews,
} from "@/server/news";

const valid = { title: "Ёлка в Эрмитаже", slug: "", excerpt: "Анонс", body: "# Текст", coverUrl: null };
const DAY = 86400_000;

async function mk(title: string, publishedAt: Date | null) {
  const [r] = await db.insert(news).values({ slug: title, title, publishedAt }).returning();
  return r;
}

describe("saveNews", () => {
  it("builds slug from the title and suffixes duplicates", async () => {
    const a = await saveNews(valid, undefined, db);
    const b = await saveNews(valid, undefined, db);
    expect(a.ok && a.slug).toBe("yolka-v-ermitazhe");
    expect(b.ok && b.slug).toBe("yolka-v-ermitazhe-2");
  });

  it("creates drafts (publishedAt null)", async () => {
    const a = await saveNews(valid, undefined, db);
    if (!a.ok) throw new Error("fail");
    const [row] = await db.select().from(news).where(eq(news.id, a.id));
    expect(row.publishedAt).toBeNull();
  });

  it("slugifies a manual slug and rejects a taken one", async () => {
    const a = await saveNews({ ...valid, slug: "Моя Новость!" }, undefined, db);
    expect(a.ok && a.slug).toBe("moya-novost");
    const b = await saveNews({ ...valid, slug: "moya-novost" }, undefined, db);
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.fieldErrors.slug).toBeTruthy();
  });

  it("allows keeping own slug on update and reports the old slug when it changes", async () => {
    const a = await saveNews(valid, undefined, db);
    if (!a.ok) throw new Error("fail");
    const same = await saveNews({ ...valid, slug: "yolka-v-ermitazhe", title: "Другое" }, a.id, db);
    expect(same.ok && same.slug).toBe("yolka-v-ermitazhe");
    const changed = await saveNews({ ...valid, slug: "new-slug" }, a.id, db);
    expect(changed.ok && changed.oldSlug).toBe("yolka-v-ermitazhe");
  });

  it("keeps the existing slug on update with empty slug", async () => {
    const a = await saveNews(valid, undefined, db);
    if (!a.ok) throw new Error("fail");
    const r = await saveNews({ ...valid, slug: "", title: "Новый заголовок" }, a.id, db);
    expect(r.ok && r.slug).toBe("yolka-v-ermitazhe");
  });

  it("sets updatedAt on update", async () => {
    const a = await saveNews(valid, undefined, db);
    if (!a.ok) throw new Error("fail");
    await db.update(news).set({ updatedAt: new Date(0) }).where(eq(news.id, a.id));
    await saveNews({ ...valid, title: "Иначе" }, a.id, db);
    const [row] = await db.select().from(news).where(eq(news.id, a.id));
    expect(row.updatedAt.getTime()).toBeGreaterThan(Date.now() - 10_000);
  });

  it("validates field limits with Russian messages", async () => {
    const r = await saveNews({ ...valid, title: "x", excerpt: "y".repeat(301), body: "z".repeat(50001) }, undefined, db);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fieldErrors.title).toBeTruthy();
      expect(r.fieldErrors.excerpt).toBeTruthy();
      expect(r.fieldErrors.body).toBeTruthy();
    }
  });

  it("rejects a bad id and an unknown id", async () => {
    expect((await saveNews(valid, 0, db)).ok).toBe(false);
    expect((await saveNews(valid, 2_147_483_648, db)).ok).toBe(false);
    expect((await saveNews(valid, 999, db)).ok).toBe(false);
  });

  it("rejects non-http cover urls", async () => {
    const r = await saveNews({ ...valid, coverUrl: "javascript:alert(1)" }, undefined, db);
    expect(r.ok).toBe(false);
  });
});

describe("setNewsPublished", () => {
  it("publishes with now() when empty, keeps existing date, unpublishes to null", async () => {
    const a = await saveNews(valid, undefined, db);
    if (!a.ok) throw new Error("fail");
    const p1 = await setNewsPublished(a.id, true, db);
    expect(p1.ok).toBe(true);
    const [r1] = await db.select().from(news).where(eq(news.id, a.id));
    expect(r1.publishedAt).not.toBeNull();
    const old = new Date(Date.now() - 5 * DAY);
    await db.update(news).set({ publishedAt: old }).where(eq(news.id, a.id));
    await setNewsPublished(a.id, true, db);
    const [r2] = await db.select().from(news).where(eq(news.id, a.id));
    expect(r2.publishedAt?.getTime()).toBe(old.getTime());
    await setNewsPublished(a.id, false, db);
    const [r3] = await db.select().from(news).where(eq(news.id, a.id));
    expect(r3.publishedAt).toBeNull();
  });

  it("fails for unknown / invalid id", async () => {
    expect((await setNewsPublished(999, true, db)).ok).toBe(false);
    expect((await setNewsPublished(-1, true, db)).ok).toBe(false);
  });
});

describe("public reads", () => {
  it("drafts are never returned", async () => {
    await mk("draft", null);
    await mk("pub", new Date(Date.now() - DAY));
    expect((await getLatestNews(3, db)).map((n) => n.slug)).toEqual(["pub"]);
    expect(await getNewsBySlug("draft", db)).toBeNull();
    expect((await getNewsBySlug("pub", db))?.title).toBe("pub");
    expect(await getNewsBySlug("nope", db)).toBeNull();
    expect((await listPublishedNews(1, db)).items.map((n) => n.slug)).toEqual(["pub"]);
  });

  it("getLatestNews(3) returns the 3 latest by publishedAt", async () => {
    for (let i = 1; i <= 5; i++) await mk(`n${i}`, new Date(Date.now() - (10 - i) * DAY));
    expect((await getLatestNews(3, db)).map((n) => n.slug)).toEqual(["n5", "n4", "n3"]);
  });

  it("paginates by 12 and clamps invalid pages to 1", async () => {
    for (let i = 1; i <= 13; i++) await mk(`n${i}`, new Date(Date.now() - (20 - i) * DAY));
    const p1 = await listPublishedNews(1, db);
    expect(p1.items).toHaveLength(12);
    expect(p1.pages).toBe(2);
    const p2 = await listPublishedNews(2, db);
    expect(p2.items.map((n) => n.slug)).toEqual(["n1"]);
    expect((await listPublishedNews(NaN, db)).page).toBe(1);
    expect((await listPublishedNews(-3, db)).page).toBe(1);
    expect((await listPublishedNews(99, db)).page).toBe(1);
  });
});

describe("admin reads", () => {
  it("lists all (drafts first-class) and gets by id", async () => {
    const d = await mk("draft", null);
    await mk("pub", new Date());
    expect((await listAllNews(db)).map((n) => n.slug).sort()).toEqual(["draft", "pub"]);
    expect((await getAdminNews(d.id, db))?.slug).toBe("draft");
    expect(await getAdminNews(0, db)).toBeNull();
    expect(await getAdminNews(12345, db)).toBeNull();
  });
});
