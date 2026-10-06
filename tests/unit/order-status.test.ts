import { describe, it, expect } from "vitest";
import { ORDER_STATUSES, STATUS_LABELS, canTransition, nextStatuses } from "@/lib/domain/order-status";

// Тип-уровневое сравнение с pgEnum вернём в задаче 4, когда enum в БД получит новые значения.
describe("order-status", () => {
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
});
