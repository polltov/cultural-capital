import { describe, it, expect } from "vitest";
import { coverVariant, headlinePrice, priceLines, routeStops, tourMetaDescription } from "@/lib/domain/tour-text";
import { formatDay, formatMonthGen, formatMonthTitle, formatWeekdayFull, moscowMonthKey, parseMoscowLocal, toMoscowIso } from "@/lib/domain/moscow-time";

describe("routeStops", () => {
  it("splits the route on middle dots and trims", () => {
    expect(routeStops("Заячий остров · Петропавловский собор ·  Невские ворота")).toEqual(["Заячий остров", "Петропавловский собор", "Невские ворота"]);
  });
  it("ignores empty parts and bullets", () => {
    expect(routeStops(" · Дворцовая •  · ")).toEqual(["Дворцовая"]);
    expect(routeStops("")).toEqual([]);
  });
});

describe("prices", () => {
  it("collapses equal prices into one ticket", () => {
    expect(priceLines({ priceChild: 2200, priceAdult: 2200 })).toEqual([{ label: "Билет", price: 2200 }]);
    expect(headlinePrice({ priceChild: 2200, priceAdult: 2200 })).toEqual({ price: "2\u00A0200\u00A0₽", note: null });
  });
  it("leads with the child ticket when prices differ", () => {
    expect(priceLines({ priceChild: 1390, priceAdult: 490 })).toEqual([{ label: "Детский", price: 1390 }, { label: "Взрослый", price: 490 }]);
    expect(headlinePrice({ priceChild: 1390, priceAdult: 490 })).toEqual({ price: "1\u00A0390\u00A0₽", note: "детский · взрослый 490\u00A0₽" });
  });
});

describe("tourMetaDescription", () => {
  const t = { title: "Тайна первой крепости", subtitle: "детский квест", route: "Заячий остров · Невские ворота", durationLabel: "2 часа", ageLabel: "6+" };
  it("joins subtitle, stops and facts", () => {
    expect(tourMetaDescription(t)).toBe("Тайна первой крепости — детский квест. Заячий остров, Невские ворота. 2 часа, 6+. Билеты онлайн");
  });
  it("stays within 160 characters", () => {
    const long = tourMetaDescription({ ...t, route: Array.from({ length: 30 }, (_, i) => `Остановка ${i}`).join(" · ") });
    expect(long.length).toBeLessThanOrEqual(160);
    expect(long.endsWith("…")).toBe(true);
  });
});

describe("coverVariant", () => {
  it("is stable and within four variants", () => {
    const v = coverVariant("taina-pervoy-kreposti");
    expect(coverVariant("taina-pervoy-kreposti")).toBe(v);
    for (const k of ["a", "b", "mosty", "dvortsy-za-odin-den", "Египет"]) expect([0, 1, 2, 3]).toContain(coverVariant(k));
  });
});

describe("moscow-time extras", () => {
  const d = parseMoscowLocal("2026-11-22T11:00");
  it("formats parts of the date", () => {
    expect(formatDay(d)).toBe("22");
    expect(formatMonthGen(d)).toBe("ноября");
    expect(formatWeekdayFull(d)).toBe("воскресенье");
    expect(moscowMonthKey(d)).toBe("2026-11");
    expect(formatMonthTitle(d, parseMoscowLocal("2026-01-01T00:00"))).toBe("Ноябрь");
  });
  it("gives ISO time with the Moscow offset", () => {
    expect(toMoscowIso(d)).toBe("2026-11-22T11:00:00+03:00");
    expect(new Date(toMoscowIso(d)).getTime()).toBe(d.getTime());
  });
});
