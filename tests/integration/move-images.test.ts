import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { faqItems, news, tours } from "@/db/schema";
import { moveVercelImages } from "@/server/move-images";
import type { S3Config } from "@/server/s3";

const cfg: S3Config = {
  endpoint: "https://s3.ru-1.storage.selcloud.ru", region: "ru-1", bucket: "kc", accessKeyId: "k", secretAccessKey: "s",
  publicUrl: "https://abc.selstorage.ru",
};
const A = "https://x1y2.public.blob.vercel-storage.com/tours/photo-AbC123.jpg";
const B = "https://x1y2.public.blob.vercel-storage.com/news/%D1%84%D0%BE%D1%82%D0%BE-Zz9.png";

function fakeFetch(broken: string[] = []) {
  return vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    if (init?.method === "PUT") return new Response(null, { status: 200 });
    if (broken.includes(url)) return new Response("gone", { status: 404 });
    return new Response(new Uint8Array([0xff, 0xd8, 0xff]), { status: 200, headers: { "content-type": "image/jpeg" } });
  });
}

async function seed() {
  const [t] = await db.insert(tours).values({
    slug: "t", title: "T", durationLabel: "2 ч", ageLabel: "6+", priceChild: 500, priceAdult: 700, coverUrl: A,
    description: `Фото: ![](${A}) и ещё [ссылка](${B}).`,
  }).returning();
  const [n] = await db.insert(news).values({ slug: "n", title: "N", coverUrl: B, body: "без фото" }).returning();
  const [f] = await db.insert(faqItems).values({ question: "?", answer: `см. ${A}` }).returning();
  return { t, n, f };
}

describe("moveVercelImages", () => {
  it("переносит каждый файл один раз и меняет адреса в обложках и текстах", async () => {
    const { t, n, f } = await seed();
    const fetchImpl = fakeFetch();
    await expect(moveVercelImages(db, cfg, fetchImpl)).resolves.toEqual({ moved: 2, failed: [] });

    const puts = fetchImpl.mock.calls.filter(([, init]) => init?.method === "PUT").map(([u]) => String(u)).sort();
    expect(puts).toEqual([
      "https://s3.ru-1.storage.selcloud.ru/kc/news/%D1%84%D0%BE%D1%82%D0%BE-Zz9.png",
      "https://s3.ru-1.storage.selcloud.ru/kc/tours/photo-AbC123.jpg",
    ]);
    const newA = "https://abc.selstorage.ru/tours/photo-AbC123.jpg";
    const newB = "https://abc.selstorage.ru/news/%D1%84%D0%BE%D1%82%D0%BE-Zz9.png";
    const [tour] = await db.select().from(tours).where(eq(tours.id, t.id));
    expect(tour.coverUrl).toBe(newA);
    expect(tour.description).toBe(`Фото: ![](${newA}) и ещё [ссылка](${newB}).`);
    const [item] = await db.select().from(news).where(eq(news.id, n.id));
    expect(item.coverUrl).toBe(newB);
    const [faq] = await db.select().from(faqItems).where(eq(faqItems.id, f.id));
    expect(faq.answer).toBe(`см. ${newA}`);

    // повторный запуск: переносить нечего
    await expect(moveVercelImages(db, cfg, fakeFetch())).resolves.toEqual({ moved: 0, failed: [] });
  });

  it("недоступный файл — в отчёт, его адрес не меняется, остальные переносятся", async () => {
    const { t, n } = await seed();
    const report = await moveVercelImages(db, cfg, fakeFetch([B]));
    expect(report.moved).toBe(1);
    expect(report.failed).toEqual([`${B}: ответ 404`]);
    const [item] = await db.select().from(news).where(eq(news.id, n.id));
    expect(item.coverUrl).toBe(B);
    const [tour] = await db.select().from(tours).where(eq(tours.id, t.id));
    expect(tour.coverUrl).toBe("https://abc.selstorage.ru/tours/photo-AbC123.jpg");
  });
});
