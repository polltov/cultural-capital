import { describe, it, expect } from "vitest";
import { SEAT_HOLDING_STATUSES, HOLD_MINUTES, freeSeats, seatsBadge, pluralRu, formatComposition } from "@/lib/domain/seats";

const F: [string, string, string] = ["место", "места", "мест"];
describe("seats", () => {
  it("holding statuses", () => expect([...SEAT_HOLDING_STATUSES]).toEqual(["confirmed", "done", "paid"]));
  it("hold minutes", () => expect(HOLD_MINUTES).toBe(15));
  it("freeSeats", () => {
    expect(freeSeats(8, 5)).toBe(3);
    expect(freeSeats(8, 10)).toBe(0);
  });
  it("seatsBadge", () => {
    expect(seatsBadge(4)).toBe("осталось 4 места");
    expect(seatsBadge(1)).toBe("осталось 1 место");
    expect(seatsBadge(2)).toBe("осталось 2 места");
    expect(seatsBadge(0)).toBe("мест нет");
    expect(seatsBadge(5)).toBeNull();
  });
  it("pluralRu", () => {
    expect(pluralRu(11, F)).toBe("мест");
    expect(pluralRu(21, F)).toBe("место");
    expect(pluralRu(22, F)).toBe("места");
    expect(pluralRu(5, F)).toBe("мест");
    expect(pluralRu(112, F)).toBe("мест");
    expect(pluralRu(0, F)).toBe("мест");
  });
  it("formatComposition", () => {
    expect(formatComposition(2, 1)).toBe("2 детских + 1 взрослый");
    expect(formatComposition(1, 0)).toBe("1 детский");
    expect(formatComposition(0, 3)).toBe("3 взрослых");
    expect(formatComposition(21, 22)).toBe("21 детский + 22 взрослых");
  });
});
