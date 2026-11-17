import { describe, expect, it } from "vitest";
import { defaultSiteContent } from "@/lib/site-content";
import { parseSiteSection } from "@/lib/validation/site-content";

describe("редактируемый контент сайта", () => {
  it("подставляет исходный текст в пустые поля и сохраняет новый", () => {
    const seo = { ...defaultSiteContent.seo, title: " ", description: "Семейные прогулки" };
    expect(parseSiteSection("seo", seo)).toEqual({
      ...defaultSiteContent.seo,
      description: "Семейные прогулки",
    });
  });

  it("сохраняет пустой список и позволяет скрыть все отзывы", () => {
    expect(parseSiteSection("route", { ...defaultSiteContent.route, items: [] })?.items).toEqual([]);
    const items = [
      { id: "review-b", quote: "Особенно понравился рассказ о набережных.", name: "Алексей", about: "", published: false },
      { id: "review-a", quote: "Дети с удовольствием прошли маршрут.", name: "Анна", about: "", published: false },
    ];
    expect(parseSiteSection("reviews", { ...defaultSiteContent.reviews, items })?.items).toEqual(items);
  });

  it("не подставляет отзывы-заглушки до публикации редактором", () => {
    expect(defaultSiteContent.reviews.items).toEqual([]);
  });

  it("принимает фото из public и своего хранилища, отвергает чужие адреса", () => {
    const hero = { ...defaultSiteContent.hero };
    expect(parseSiteSection("hero", hero)?.mainPhoto.url).toBe("/assets/dvortsovaya.jpg");
    hero.mainPhoto = { ...hero.mainPhoto, url: "https://images.example.com/site/photo.jpg" };
    expect(parseSiteSection("hero", hero, "https://images.example.com")?.mainPhoto.url).toBe(hero.mainPhoto.url);
    expect(parseSiteSection("hero", hero)).toBeNull();
    for (const url of ["https://images.example.com.other/site/photo.jpg", "//example.com/image.jpg", "/assets/../brand/og.jpg"]) {
      expect(parseSiteSection("hero", { ...hero, mainPhoto: { ...hero.mainPhoto, url } }, "https://images.example.com")).toBeNull();
    }
  });

  it("разрешает только адреса указанных соцсетей", () => {
    const contacts = { ...defaultSiteContent.contacts, telegram: "https://t.me/family_tours", vk: "https://vk.com/club123" };
    expect(parseSiteSection("contacts", contacts)).toEqual(contacts);
    expect(parseSiteSection("contacts", { ...contacts, vk: "https://vk.com.example.com/club123" })).toBeNull();
    expect(parseSiteSection("contacts", { ...contacts, telegram: "family_tours?next=example" })).toBeNull();
  });
});
