import { describe, it, expect } from "vitest";
import { paymentItems, refundItems, paymentDescription } from "@/lib/domain/receipt";

const o = { tourTitle: "Эрмитаж", startsAt: new Date("2026-10-12T08:00:00Z"), children: 2, adults: 1, priceChild: 1000, priceAdult: 1270 };

describe("paymentItems", () => {
  it("one item per ticket type, sum matches the order total", () => {
    const items = paymentItems(o, 1, "full_prepayment");
    expect(items.map((i) => i.description)).toEqual([
      "Экскурсия «Эрмитаж», 12.10.2026 11:00, детский билет",
      "Экскурсия «Эрмитаж», 12.10.2026 11:00, взрослый билет",
    ]);
    expect(items.reduce((s, i) => s + Number(i.amount.value) * i.quantity, 0)).toBe(3270);
  });

  it("amount is per unit, quantity is the count, API keys are snake_case", () => {
    const [child, adult] = paymentItems(o, 4, "full_payment");
    expect(child).toEqual({
      description: "Экскурсия «Эрмитаж», 12.10.2026 11:00, детский билет",
      quantity: 2,
      amount: { value: "1000.00", currency: "RUB" },
      vat_code: 4,
      payment_subject: "service",
      payment_mode: "full_payment",
    });
    expect(adult).toMatchObject({ quantity: 1, amount: { value: "1270.00", currency: "RUB" }, vat_code: 4, payment_mode: "full_payment" });
  });

  it("skips a ticket type with zero quantity", () => {
    const adultsOnly = paymentItems({ ...o, children: 0 }, 1, "full_payment");
    expect(adultsOnly).toHaveLength(1);
    expect(adultsOnly[0].description).toBe("Экскурсия «Эрмитаж», 12.10.2026 11:00, взрослый билет");
    const childrenOnly = paymentItems({ ...o, adults: 0 }, 1, "full_payment");
    expect(childrenOnly).toHaveLength(1);
    expect(childrenOnly[0].description).toBe("Экскурсия «Эрмитаж», 12.10.2026 11:00, детский билет");
  });

  it("truncates the title and keeps the suffix, length ≤ 128", () => {
    const items = paymentItems({ ...o, tourTitle: "Я".repeat(200) }, 1, "full_prepayment");
    for (const i of items) expect(i.description.length).toBeLessThanOrEqual(128);
    const long = items[0].description;
    expect(long.length).toBe(128);
    expect(long.startsWith("Экскурсия «ЯЯЯ")).toBe(true);
    expect(long.endsWith("…», 12.10.2026 11:00, детский билет")).toBe(true);
    expect(items[1].description.endsWith("11:00, взрослый билет")).toBe(true);
  });

  it("leaves a title that fits exactly untouched, truncates one char more", () => {
    const prefix = "Экскурсия «";
    const suffix = "», 12.10.2026 11:00, взрослый билет";
    const title = "Ы".repeat(128 - prefix.length - suffix.length);
    const [, adult] = paymentItems({ ...o, tourTitle: title }, 1, "full_payment");
    expect(adult.description).toBe(`${prefix}${title}${suffix}`);
    expect(adult.description.length).toBe(128);
    const [, adultOver] = paymentItems({ ...o, tourTitle: title + "Ы" }, 1, "full_payment");
    expect(adultOver.description.length).toBe(128);
    expect(adultOver.description).toContain("Ы…»");
  });
});

// Каждая функция режет название по своему бюджету (у детского и взрослого билета он разный по чётности),
// поэтому проверяем оба варианта выравнивания: «😀…» и «Я😀…» — наивный slice ломается хотя бы на одном.
describe("truncation never splits a surrogate pair", () => {
  const titles = [{ name: "even", title: "😀".repeat(100) }, { name: "odd", title: "Я" + "😀".repeat(100) }];

  function expectWellFormed(d: string) {
    expect(d.length).toBeLessThanOrEqual(128);
    expect(d).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
    expect(d).not.toMatch(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
  }

  it.each(titles)("paymentItems, every item ($name alignment)", ({ title }) => {
    const items = paymentItems({ ...o, tourTitle: title }, 1, "full_prepayment");
    expect(items).toHaveLength(2);
    for (const i of items) {
      expect(i.description).toContain("…»");
      expectWellFormed(i.description);
    }
  });

  it.each(titles)("refundItems ($name alignment)", ({ title }) => {
    const d = refundItems({ tourTitle: title, startsAt: o.startsAt }, 500, 1)[0].description;
    expect(d).toContain("…»");
    expectWellFormed(d);
  });

  it.each(titles)("paymentDescription ($name alignment)", ({ title }) => {
    const d = paymentDescription("КС-0057", title, o.startsAt);
    expect(d).toContain("… · ");
    expectWellFormed(d);
  });
});

describe("refundItems", () => {
  it("a single item for the whole refund amount", () => {
    const items = refundItems(o, 1635, 4);
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      description: "Возврат: Экскурсия «Эрмитаж», 12.10.2026 11:00",
      quantity: 1,
      amount: { value: "1635.00", currency: "RUB" },
      vat_code: 4,
      payment_subject: "service",
      payment_mode: "full_prepayment",
    });
  });

  it("truncates the title and keeps the date, length ≤ 128", () => {
    const d = refundItems({ tourTitle: "Я".repeat(200), startsAt: o.startsAt }, 500, 1)[0].description;
    expect(d.length).toBe(128);
    expect(d.startsWith("Возврат: Экскурсия «ЯЯЯ")).toBe(true);
    expect(d.endsWith("…», 12.10.2026 11:00")).toBe(true);
  });
});

describe("paymentDescription", () => {
  it("number · title · date and time", () => {
    expect(paymentDescription("КС-0057", "Эрмитаж", o.startsAt)).toBe("КС-0057 · Эрмитаж · 12.10 11:00");
  });

  it("truncates the title and keeps number and date, length ≤ 128", () => {
    const d = paymentDescription("КС-0057", "Я".repeat(200), o.startsAt);
    expect(d.length).toBe(128);
    expect(d.startsWith("КС-0057 · ЯЯЯ")).toBe(true);
    expect(d.endsWith("… · 12.10 11:00")).toBe(true);
  });
});
