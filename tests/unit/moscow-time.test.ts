import { describe, it, expect } from "vitest";
import { parseMoscowLocal, toMoscowLocalInput, formatDayMonth, formatWeekday, formatTime, formatSessionLong } from "@/lib/domain/moscow-time";

describe("moscow-time", () => {
  const d = parseMoscowLocal("2026-10-12T11:00");
  it("parse", () => expect(d.toISOString()).toBe("2026-10-12T08:00:00.000Z"));
  it("format", () => {
    expect(formatTime(d)).toBe("11:00");
    expect(formatDayMonth(d)).toBe("12 окт");
    expect(formatWeekday(d)).toBe("пн");
    expect(toMoscowLocalInput(d)).toBe("2026-10-12T11:00");
  });
  it("weekdays", () => {
    expect(formatWeekday(parseMoscowLocal("2026-10-04T11:00"))).toBe("вскр");
    expect(formatWeekday(parseMoscowLocal("2026-10-03T11:00"))).toBe("сб");
  });
  it("long", () => expect(formatSessionLong(parseMoscowLocal("2026-10-04T11:00"))).toBe("вс, 4 октября 2026, 11:00"));
  it("day boundary in Moscow", () => {
    const x = parseMoscowLocal("2026-10-12T00:30");
    expect(x.toISOString()).toBe("2026-10-11T21:30:00.000Z");
    expect(formatDayMonth(x)).toBe("12 окт");
    expect(toMoscowLocalInput(x)).toBe("2026-10-12T00:30");
  });
  it("May short month", () => expect(formatDayMonth(parseMoscowLocal("2026-05-09T10:00"))).toBe("9 мая"));
});

import { formatDateLong } from "@/lib/domain/moscow-time";
describe("formatDateLong", () => {
  it("formats in Moscow time with genitive month", () => {
    expect(formatDateLong(new Date("2026-10-04T09:00:00Z"))).toBe("4 октября 2026");
  });
  it("uses Moscow date across midnight UTC", () => {
    expect(formatDateLong(new Date("2026-10-04T22:00:00Z"))).toBe("5 октября 2026");
  });
});
