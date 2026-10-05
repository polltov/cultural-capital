import { describe, it, expect, expectTypeOf } from "vitest";
import { ORDER_STATUSES, STATUS_LABELS, canTransition, nextStatuses, type OrderStatus } from "@/lib/domain/order-status";
import type { orderStatus } from "@/db/schema";

describe("order-status", () => {
  it("matches db enum (type-level)", () => {
    expectTypeOf<OrderStatus>().toEqualTypeOf<(typeof orderStatus.enumValues)[number]>();
  });
  it("labels", () => {
    expect(STATUS_LABELS).toEqual({ new: "Новая", confirmed: "Подтверждена", done: "Проведена", cancelled: "Отменена" });
  });
  it("exactly 4 transitions allowed", () => {
    const ok = ["new>confirmed", "confirmed>done", "new>cancelled", "confirmed>cancelled"];
    let n = 0;
    for (const a of ORDER_STATUSES) for (const b of ORDER_STATUSES) {
      const exp = ok.includes(`${a}>${b}`);
      expect(canTransition(a, b), `${a}>${b}`).toBe(exp);
      if (exp) n++;
    }
    expect(n).toBe(4);
  });
  it("nextStatuses", () => {
    expect(nextStatuses("done")).toEqual([]);
    expect(nextStatuses("cancelled")).toEqual([]);
    expect(nextStatuses("new")).toEqual(["confirmed", "cancelled"]);
    expect(nextStatuses("confirmed")).toEqual(["done", "cancelled"]);
  });
});
