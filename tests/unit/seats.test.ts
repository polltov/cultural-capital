import { describe, it, expect } from "vitest";
import { SEAT_HOLDING_STATUSES, freeSeats, seatsBadge, pluralRu } from "@/lib/domain/seats";

const F: [string, string, string] = ["место", "места", "мест"];
describe("seats", () => {
  it("holding statuses", () => expect([...SEAT_HOLDING_STATUSES]).toEqual(["confirmed", "done"]));
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
});
