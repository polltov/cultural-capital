import { describe, it, expect } from "vitest";
import { formatOrderNumber } from "@/lib/domain/order-number";

describe("formatOrderNumber", () => {
  it("pads", () => {
    expect(formatOrderNumber(42)).toBe("КС-0042");
    expect(formatOrderNumber(12345)).toBe("КС-12345");
  });
});
