import { afterEach, describe, expect, it, vi } from "vitest";
import { createReceiptRefund } from "@/server/payments/refund";
import { fakeGateway } from "../support/fake-gateway";

afterEach(() => vi.unstubAllEnvs());

const refund = {
  idempotenceKey: "refund-7", paymentId: "pay-1", amount: 1635, email: "anna@example.com",
  tourTitle: "Эрмитаж", startsAt: new Date("2026-10-12T08:00:00Z"),
};

describe("createReceiptRefund", () => {
  it("sends one refund with a receipt line for the whole amount and returns the gateway answer", async () => {
    const gw = fakeGateway();
    expect(await createReceiptRefund(gw, refund)).toEqual({ id: "ref-1", status: "succeeded" });

    expect(gw.refunds).toHaveLength(1);
    expect(gw.refunds[0]).toMatchObject({ idempotenceKey: "refund-7", paymentId: "pay-1", amount: 1635, customerEmail: "anna@example.com" });
    expect(gw.refunds[0].items).toHaveLength(1);
    expect(gw.refunds[0].items[0]).toMatchObject({
      description: "Возврат: Экскурсия «Эрмитаж», 12.10.2026 11:00",
      quantity: 1, amount: { value: "1635.00", currency: "RUB" }, vat_code: 1, payment_mode: "full_prepayment",
    });
  });

  it("takes the VAT code from YOOKASSA_VAT_CODE", async () => {
    vi.stubEnv("YOOKASSA_VAT_CODE", "4");
    const gw = fakeGateway();
    await createReceiptRefund(gw, refund);
    expect(gw.refunds[0].items[0].vat_code).toBe(4);
  });

  it("a pending refund is a success", async () => {
    const gw = fakeGateway();
    gw.createRefund = async () => ({ id: "ref-p", status: "pending" });
    expect(await createReceiptRefund(gw, refund)).toEqual({ id: "ref-p", status: "pending" });
  });

  it("throws on a canceled refund", async () => {
    const gw = fakeGateway();
    gw.createRefund = async () => ({ id: "ref-x", status: "canceled" });
    await expect(createReceiptRefund(gw, refund)).rejects.toThrow("ЮKassa отклонила возврат");
  });

  it.each([null, ""])("throws without an e-mail (%j) and does not call the gateway", async (email) => {
    const gw = fakeGateway();
    await expect(createReceiptRefund(gw, { ...refund, email })).rejects.toThrow("у заказа нет email для чека возврата");
    expect(gw.refunds).toHaveLength(0);
  });

  it("throws on an invalid VAT code and does not call the gateway", async () => {
    vi.stubEnv("YOOKASSA_VAT_CODE", "abc");
    const gw = fakeGateway();
    await expect(createReceiptRefund(gw, refund)).rejects.toThrow(/YOOKASSA_VAT_CODE/);
    expect(gw.refunds).toHaveLength(0);
  });

  it("passes gateway errors through", async () => {
    const gw = fakeGateway();
    gw.failNext("createRefund");
    await expect(createReceiptRefund(gw, refund)).rejects.toThrow("fake failure");
  });
});
