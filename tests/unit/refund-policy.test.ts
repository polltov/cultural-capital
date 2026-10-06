import { describe, it, expect } from "vitest";
import { defaultRefundAmount } from "@/lib/domain/refund-policy";

describe("defaultRefundAmount", () => {
  const start = new Date("2026-10-12T08:00:00Z");
  it("full refund when at least 24 h before start", () => {
    expect(defaultRefundAmount(3270, start, new Date("2026-10-11T08:00:00Z"))).toBe(3270); // ровно 24 ч
    expect(defaultRefundAmount(3270, start, new Date("2026-10-01T08:00:00Z"))).toBe(3270);
  });
  it("half (rounded up) when less than 24 h before start", () => {
    expect(defaultRefundAmount(3270, start, new Date("2026-10-11T08:00:01Z"))).toBe(1635);
    expect(defaultRefundAmount(3271, start, new Date("2026-10-12T07:00:00Z"))).toBe(1636);
  });
  it("half (rounded up) after the start", () => {
    expect(defaultRefundAmount(3271, start, new Date("2026-10-12T09:00:00Z"))).toBe(1636);
  });
});
