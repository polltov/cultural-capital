import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ syncPayment: vi.fn(), runSyncEffects: vi.fn(), recordPaymentEvent: vi.fn() }));

vi.mock("@/server/payment-sync", () => mocks);
vi.mock("next/server", () => ({ after: (fn: () => unknown) => fn() }));

import { POST } from "@/app/api/payments/yookassa/route";

const call = (body: string) => POST(new Request("http://x.test/api/payments/yookassa", { method: "POST", body }));
const send = (body: unknown) => call(JSON.stringify(body));

let errorLog: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.runSyncEffects.mockResolvedValue(undefined);
  mocks.recordPaymentEvent.mockResolvedValue(undefined);
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const nothingDone = () => {
  expect(mocks.syncPayment).not.toHaveBeenCalled();
  expect(mocks.runSyncEffects).not.toHaveBeenCalled();
  expect(mocks.recordPaymentEvent).not.toHaveBeenCalled();
};

describe("POST /api/payments/yookassa — некорректное тело", () => {
  it.each([
    ["не JSON", "это не json"],
    ["пустое тело", ""],
    ["JSON null", "null"],
    ["event не строка", JSON.stringify({ event: 1, object: { id: "p1" } })],
    ["нет event", JSON.stringify({ object: { id: "p1" } })],
    ["payment.*: нет object", JSON.stringify({ event: "payment.succeeded" })],
    ["payment.*: нет object.id", JSON.stringify({ event: "payment.succeeded", object: {} })],
    ["payment.*: object.id не строка", JSON.stringify({ event: "payment.succeeded", object: { id: 7 } })],
    ["payment.*: пустой object.id", JSON.stringify({ event: "payment.canceled", object: { id: "" } })],
    ["refund.succeeded: нет object.payment_id", JSON.stringify({ event: "refund.succeeded", object: { id: "r1" } })],
    ["refund.succeeded: object.payment_id не строка", JSON.stringify({ event: "refund.succeeded", object: { id: "r1", payment_id: 5 } })],
  ])("%s → 400, ничего не делает", async (_name, body) => {
    expect((await call(body)).status).toBe(400);
    nothingDone();
  });
});

describe("POST /api/payments/yookassa — payment.*", () => {
  it.each(["payment.succeeded", "payment.canceled", "payment.waiting_for_capture"])("%s → syncPayment(id, webhook), 200, эффекты с его исходом", async (event) => {
    const outcome = { kind: "paid", orderId: 5 };
    mocks.syncPayment.mockResolvedValue(outcome);
    const res = await send({ type: "notification", event, object: { id: "p1", status: "succeeded" } });
    expect(res.status).toBe(200);
    expect(mocks.syncPayment).toHaveBeenCalledExactlyOnceWith("p1", "webhook");
    expect(mocks.runSyncEffects).toHaveBeenCalledExactlyOnceWith(outcome);
    expect(mocks.recordPaymentEvent).not.toHaveBeenCalled();
  });

  it("платёж не наш (unknown) → всё равно 200", async () => {
    mocks.syncPayment.mockResolvedValue({ kind: "unknown" });
    expect((await send({ type: "notification", event: "payment.succeeded", object: { id: "p2" } })).status).toBe(200);
    expect(mocks.syncPayment).toHaveBeenCalledExactlyOnceWith("p2", "webhook");
  });

  it("syncPayment бросает → 500 (ЮKassa повторит), эффекты не запускаются", async () => {
    mocks.syncPayment.mockRejectedValue(new Error("ЮKassa недоступна"));
    const res = await send({ type: "notification", event: "payment.succeeded", object: { id: "p1" } });
    expect(res.status).toBe(500);
    expect(mocks.runSyncEffects).not.toHaveBeenCalled();
  });

  it("в лог не попадает тело уведомления (в нём бывает email покупателя)", async () => {
    mocks.syncPayment.mockRejectedValue(new Error("сбой БД"));
    await send({ type: "notification", event: "payment.succeeded", object: { id: "p1", customer: { email: "anna@example.com" } } });
    expect(errorLog).toHaveBeenCalled();
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("anna@example.com");
  });
});

describe("POST /api/payments/yookassa — refund.succeeded", () => {
  const body = { type: "notification", event: "refund.succeeded", object: { id: "r1", payment_id: "p1", status: "succeeded", amount: { value: "1700.00", currency: "RUB" } } };

  it("пишет в журнал по payment_id, статус заказа не трогает → 200", async () => {
    const res = await send(body);
    expect(res.status).toBe(200);
    expect(mocks.recordPaymentEvent).toHaveBeenCalledExactlyOnceWith({
      source: "webhook", event: "refund.succeeded", paymentId: "p1", payload: body, note: "refund.succeeded",
    });
    expect(mocks.syncPayment).not.toHaveBeenCalled();
    expect(mocks.runSyncEffects).not.toHaveBeenCalled();
  });

  it("запись в журнал не удалась → 500 (ЮKassa повторит)", async () => {
    mocks.recordPaymentEvent.mockRejectedValue(new Error("сбой БД"));
    expect((await send(body)).status).toBe(500);
  });
});

describe("POST /api/payments/yookassa — прочие события", () => {
  it.each(["payment_method.active", "payout.succeeded", "deal.closed", "refund.failed", ""])("%j → 200 без действий", async (event) => {
    expect((await send({ type: "notification", event, object: { id: "x1" } })).status).toBe(200);
    nothingDone();
  });

  it("неизвестное событие без object → 200", async () => {
    expect((await send({ type: "notification", event: "deal.closed" })).status).toBe(200);
    nothingDone();
  });
});
