import { describe, it, expect } from "vitest";
import { groupByMonth, nextAvailable, scheduleOf } from "@/lib/domain/schedule";
import { parseMoscowLocal } from "@/lib/domain/moscow-time";

const at = (s: string) => parseMoscowLocal(s);
const catalog = [
  { tour: "Эрмитаж", sessions: [{ id: 1, startsAt: at("2026-11-22T11:00"), free: 0 }, { id: 2, startsAt: at("2026-12-06T11:00"), free: 8 }] },
  { tour: "Крепость", sessions: [{ id: 3, startsAt: at("2026-11-21T12:00"), free: 3 }] },
  { tour: "Мосты", sessions: [{ id: 4, startsAt: at("2026-11-22T11:00"), free: 5 }] },
];

describe("scheduleOf", () => {
  it("lays all sessions out by start time, catalog order breaking ties", () => {
    expect(scheduleOf(catalog).map((i) => i.session.id)).toEqual([3, 1, 4, 2]);
    expect(scheduleOf(catalog).map((i) => i.tour)).toEqual(["Крепость", "Эрмитаж", "Мосты", "Эрмитаж"]);
  });
  it("honours the limit", () => {
    expect(scheduleOf(catalog, 2).map((i) => i.session.id)).toEqual([3, 1]);
    expect(scheduleOf([], 3)).toEqual([]);
  });
});

describe("groupByMonth", () => {
  const now = at("2026-11-12T10:00");
  it("groups consecutive sessions by Moscow month", () => {
    const months = groupByMonth(scheduleOf(catalog), now);
    expect(months.map((m) => [m.key, m.title, m.items.map((i) => i.session.id)])).toEqual([
      ["2026-11", "Ноябрь", [3, 1, 4]],
      ["2026-12", "Декабрь", [2]],
    ]);
  });
  it("adds the year to months of another year", () => {
    const months = groupByMonth(scheduleOf([{ tour: "x", sessions: [{ id: 9, startsAt: at("2027-01-03T12:00"), free: 1 }] }]), now);
    expect(months[0].title).toBe("Январь 2027");
  });
  it("uses the Moscow date at midnight UTC boundaries", () => {
    // 30 ноября 23:30 UTC — это уже 1 декабря по Москве
    const months = groupByMonth(scheduleOf([{ tour: "x", sessions: [{ id: 5, startsAt: new Date("2026-11-30T23:30:00Z"), free: 1 }] }]), now);
    expect(months[0].key).toBe("2026-12");
  });
});

describe("nextAvailable", () => {
  it("skips sold-out sessions", () => {
    expect(nextAvailable(scheduleOf(catalog).slice(1))?.session.id).toBe(4);
    expect(nextAvailable([])).toBeNull();
  });
});
