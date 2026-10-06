import { describe, it, expect } from "vitest";
import { orderTotal, formatRub, toApiAmount } from "@/lib/domain/pricing";

describe("pricing", () => {
  it("orderTotal", () => expect(orderTotal({ children: 2, adults: 1, priceChild: 1390, priceAdult: 490 })).toBe(3270));
  it("toApiAmount: whole rubles → string with two decimals", () => {
    expect(toApiAmount(1700)).toBe("1700.00");
    expect(toApiAmount(0)).toBe("0.00");
    expect(toApiAmount(1234567)).toBe("1234567.00");
  });
  it("formatRub", () => {
    expect(formatRub(1390)).toBe("1\u00A0390\u00A0₽");
    expect(formatRub(490)).toBe("490\u00A0₽");
    expect(formatRub(1234567)).toBe("1\u00A0234\u00A0567\u00A0₽");
  });
});
