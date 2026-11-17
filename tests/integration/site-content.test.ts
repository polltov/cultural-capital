import { describe, expect, it } from "vitest";
import { defaultSiteContent } from "@/lib/site-content";
import { readSiteContent, saveSiteSection } from "@/server/site-content";

describe("контент сайта в базе", () => {
  it("показывает прежний сайт без записей и сохраняет секции независимо", async () => {
    expect((await readSiteContent()).content).toEqual(defaultSiteContent);
    const seo = { ...defaultSiteContent.seo, title: "Семейные прогулки" };
    expect(await saveSiteSection("seo", 0, seo)).toEqual({ ok: true, revision: 1, content: seo });
    const reviews = { ...defaultSiteContent.reviews, items: [] };
    expect(await saveSiteSection("reviews", 0, reviews)).toMatchObject({ ok: true, revision: 1 });
    expect(await readSiteContent()).toEqual({
      content: { ...defaultSiteContent, seo, reviews },
      revisions: { seo: 1, reviews: 1 },
    });
  });

  it("не затирает правки из более свежей вкладки", async () => {
    const saved = { description: "Семейные экскурсии" };
    await saveSiteSection("footer", 0, saved);
    const results = await Promise.all([
      saveSiteSection("footer", 1, { description: "Первая правка" }),
      saveSiteSection("footer", 1, { description: "Вторая правка" }),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect((await readSiteContent()).revisions.footer).toBe(2);
  });
});
