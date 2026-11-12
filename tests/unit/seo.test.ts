import { describe, it, expect, afterEach } from "vitest";
import { breadcrumbLd, faqLd, ldJson, organizationLd, plainText, tourLd } from "@/lib/seo";
import { coverVariants } from "@/lib/domain/tour-text";
import { parseMoscowLocal } from "@/lib/domain/moscow-time";
import { contacts } from "@/lib/contacts";

const savedSite = process.env.SITE_URL;
afterEach(() => {
  process.env.SITE_URL = savedSite;
  contacts.telegram = "";
});

type Offer = { name: string; price: string; priceCurrency: string; availability: string };
type Trip = { "@type": string; url: string; image: string; itinerary: { itemListElement: { item: { name: string } }[] }; offers: Offer[] };
type Ev = { "@type": string; startDate: string; location: unknown; offers: Offer[] };
const split = (ld: unknown[]) => ld as [Trip, ...Ev[]];

const tour = {
  slug: "fort", title: "Тайна первой крепости", subtitle: "детский квест", route: "Заячий остров · Невские ворота",
  durationLabel: "2 часа", ageLabel: "6+", coverUrl: null, meetingPoint: "У Невских ворот", priceChild: 2200, priceAdult: 2200,
};

describe("tourLd", () => {
  it("describes the trip with its stops and one event per session", () => {
    process.env.SITE_URL = "https://kc.example";
    const [trip, ...events] = split(tourLd(tour, [
      { startsAt: parseMoscowLocal("2026-11-21T12:00"), free: 3 },
      { startsAt: parseMoscowLocal("2026-12-05T12:00"), free: 0 },
    ]));
    expect(trip["@type"]).toBe("TouristTrip");
    expect(trip.url).toBe("https://kc.example/tours/fort");
    expect(trip.image).toBe("https://kc.example/brand/og.jpg");
    expect(trip.itinerary.itemListElement.map((i) => i.item.name)).toEqual(["Заячий остров", "Невские ворота"]);
    expect(trip.offers).toEqual([expect.objectContaining({ name: "Билет", price: "2200.00", priceCurrency: "RUB", availability: "https://schema.org/InStock" })]);

    expect(events.map((e) => [e["@type"], e.startDate, e.offers[0].availability])).toEqual([
      ["Event", "2026-11-21T12:00:00+03:00", "https://schema.org/InStock"],
      ["Event", "2026-12-05T12:00:00+03:00", "https://schema.org/SoldOut"],
    ]);
    expect(events[0].location).toEqual({ "@type": "Place", name: "У Невских ворот", address: { "@type": "PostalAddress", addressLocality: "Санкт-Петербург", addressCountry: "RU" } });
  });

  it("names child and adult offers when prices differ and keeps an uploaded cover URL", () => {
    const [trip] = split(tourLd({ ...tour, priceAdult: 490, coverUrl: "https://x.public.blob.vercel-storage.com/a.jpg" }, []));
    expect(trip.offers.map((o) => [o.name, o.price])).toEqual([["Детский билет", "2200.00"], ["Взрослый билет", "490.00"]]);
    expect(trip.image).toBe("https://x.public.blob.vercel-storage.com/a.jpg");
    expect(trip.offers[0].availability).toBe("https://schema.org/SoldOut");
  });
});

describe("organizationLd and breadcrumbs", () => {
  it("adds social links only when they are filled", () => {
    process.env.SITE_URL = "https://kc.example";
    expect(organizationLd()).not.toHaveProperty("sameAs");
    contacts.telegram = "kultstolica";
    expect(organizationLd().sameAs).toEqual(["https://t.me/kultstolica"]);
  });
  it("builds absolute breadcrumb links", () => {
    process.env.SITE_URL = "https://kc.example";
    expect(breadcrumbLd([{ name: "Главная", path: "/" }, { name: "Афиша", path: "/afisha" }]).itemListElement.map((i) => i.item))
      .toEqual(["https://kc.example/", "https://kc.example/afisha"]);
  });
});

describe("ldJson", () => {
  it("escapes < so admin-entered text cannot close the script tag", () => {
    expect(ldJson({ name: "</script><script>alert(1)</script>" })).not.toContain("</script>");
    expect(JSON.parse(ldJson({ name: "a<b" })).name).toBe("a<b");
  });
});

describe("coverVariants", () => {
  it("numbers only tours without a photo, in catalog order", () => {
    const m = coverVariants([
      { slug: "a", coverUrl: "/x.jpg" }, { slug: "b", coverUrl: null }, { slug: "c", coverUrl: null },
      { slug: "d", coverUrl: null }, { slug: "e", coverUrl: null }, { slug: "f", coverUrl: null },
    ]);
    expect([...m.entries()]).toEqual([["b", 0], ["c", 1], ["d", 2], ["e", 3], ["f", 0]]);
  });
});

describe("faqLd", () => {
  it("turns Markdown answers into plain text", () => {
    expect(plainText("Да, **на поводке** и в _наморднике_.")).toBe("Да, на поводке и в наморднике.");
    expect(plainText("Первый абзац.\n\nВторой:\n\n- раз\n- [два](https://example.com)\n\n## Итог\n\n1. три")).toBe("Первый абзац. Второй: раз два Итог три");
    // звёздочка в тексте (2 * 3) и подчёркивание в слове не трогаются
    expect(plainText("Скидка 2 * 3 = 6, файл my_file")).toBe("Скидка 2 * 3 = 6, файл my_file");
  });

  it("builds a FAQPage and skips empty questions or answers", () => {
    const ld = faqLd([
      { question: "Можно ли с собакой?", answer: "Да, **на поводке**." },
      { question: " ", answer: "без вопроса" },
      { question: "Пустой ответ", answer: "  " },
    ]);
    expect(ld).toEqual({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [{ "@type": "Question", name: "Можно ли с собакой?", acceptedAnswer: { "@type": "Answer", text: "Да, на поводке." } }],
    });
    expect(faqLd([])).toBeNull();
  });
});
