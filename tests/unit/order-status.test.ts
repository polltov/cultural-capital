import { describe, it, expect, expectTypeOf } from "vitest";
import { ORDER_STATUSES, STATUS_LABELS, canTransition, nextStatuses, paymentStatusLabel, type OrderStatus } from "@/lib/domain/order-status";
import { orderStatus } from "@/db/schema";

describe("order-status", () => {
  it("OrderStatus совпадает со значениями pgEnum", () => {
    type DbStatus = (typeof orderStatus.enumValues)[number];
    expectTypeOf<OrderStatus>().toExtend<DbStatus>();
    expectTypeOf<DbStatus>().toExtend<OrderStatus>();
    expect([...orderStatus.enumValues]).toEqual([...ORDER_STATUSES]);
  });
  it("statuses", () => {
    expect([...ORDER_STATUSES]).toEqual(["new", "confirmed", "done", "cancelled", "awaiting_payment", "paid", "expired"]);
  });
  it("labels", () => {
    expect(STATUS_LABELS).toEqual({
      new: "Новая заявка",
      confirmed: "Заявка подтверждена",
      done: "Проведён",
      cancelled: "Отменён",
      awaiting_payment: "Ждёт оплаты",
      paid: "Оплачен",
      expired: "Не оплачен",
    });
    expect(STATUS_LABELS.expired).toBe("Не оплачен");
  });
  it("exactly 5 manual transitions allowed", () => {
    const ok = ["new>confirmed", "confirmed>done", "new>cancelled", "confirmed>cancelled", "paid>done"];
    let n = 0;
    for (const a of ORDER_STATUSES) for (const b of ORDER_STATUSES) {
      const exp = ok.includes(`${a}>${b}`);
      expect(canTransition(a, b), `${a}>${b}`).toBe(exp);
      if (exp) n++;
    }
    expect(n).toBe(5);
  });
  it("paid cannot be cancelled manually (only via refund)", () => {
    expect(canTransition("paid", "cancelled")).toBe(false);
  });
  it("nextStatuses", () => {
    expect(nextStatuses("done")).toEqual([]);
    expect(nextStatuses("cancelled")).toEqual([]);
    expect(nextStatuses("new")).toEqual(["confirmed", "cancelled"]);
    expect(nextStatuses("confirmed")).toEqual(["done", "cancelled"]);
    expect(nextStatuses("paid")).toEqual(["done"]);
    expect(nextStatuses("awaiting_payment")).toEqual([]);
    expect(nextStatuses("expired")).toEqual([]);
  });
  it("paymentStatusLabel: статусы ЮKassa словами, пустой — прочерк, незнакомый — как есть", () => {
    expect(paymentStatusLabel("pending")).toBe("Ждёт оплаты");
    expect(paymentStatusLabel("waiting_for_capture")).toBe("Платёж на проверке");
    expect(paymentStatusLabel("succeeded")).toBe("Платёж прошёл");
    expect(paymentStatusLabel("canceled")).toBe("Платёж отклонён");
    expect(paymentStatusLabel(null)).toBe("—");
    expect(paymentStatusLabel("weird")).toBe("weird");
  });
});
