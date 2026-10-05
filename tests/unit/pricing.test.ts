import { describe, it, expect } from "vitest";
import { orderTotal, formatRub } from "@/lib/domain/pricing";

describe("pricing", () => {
  it("orderTotal", () => expect(orderTotal({ children: 2, adults: 1, priceChild: 1390, priceAdult: 490 })).toBe(3270));
  it("formatRub", () => {
    expect(formatRub(1390)).toBe("1 390 ₽");
    expect(formatRub(490)).toBe("490 ₽");
    expect(formatRub(1234567)).toBe("1 234 567 ₽");
  });
});
