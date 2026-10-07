import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ syncPayment: vi.fn(), syncRefund: vi.fn(), runSyncEffects: vi.fn() }));

vi.mock("@/server/payment-sync", () => mocks);
vi.mock("next/server", () => ({ after: (fn: () => unknown) => fn() }));

import { POST } from "@/app/api/payments/yookassa/route";

const call = (body: string) => POST(new Request("http://x.test/api/payments/yookassa", { method: "POST", body }));
const send = (body: unknown) => call(JSON.stringify(body));

let errorLog: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.runSyncEffects.mockResolvedValue(undefined);
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const nothingDone = () => {
  expect(mocks.syncPayment).not.toHaveBeenCalled();
  expect(mocks.syncRefund).not.toHaveBeenCalled();
  expect(mocks.runSyncEffects).not.toHaveBeenCalled();
};

const long = "a".repeat(101);

describe("POST /api/payments/yookassa — некорректное тело", () => {
  it.each([
    ["не JSON", "это не json"],
    ["пустое тело", ""],
    ["JSON null", "null"],
    ["event не строка", JSON.stringify({ event: 1, object: { id: "p1" } })],
    ["нет event", JSON.stringify({ object: { id: "p1" } })],
    ["пустой event", JSON.stringify({ event: "", object: { id: "p1" } })],
    ["event длиннее 100 символов", JSON.stringify({ event: `payment.${long}`, object: { id: "p1" } })],
    ["event с пробелом", JSON.stringify({ event: "payment succeeded", object: { id: "p1" } })],
    ["event с разметкой", JSON.stringify({ event: "<script>", object: { id: "p1" } })],
    ["event кириллицей", JSON.stringify({ event: "платёж.прошёл", object: { id: "p1" } })],
    ["payment.*: нет object", JSON.stringify({ event: "payment.succeeded" })],
    ["payment.*: нет object.id", JSON.stringify({ event: "payment.succeeded", object: {} })],
    ["payment.*: object.id не строка", JSON.stringify({ event: "payment.succeeded", object: { id: 7 } })],
    ["payment.*: пустой object.id", JSON.stringify({ event: "payment.canceled", object: { id: "" } })],
    ["payment.*: object.id длиннее 100 символов", JSON.stringify({ event: "payment.succeeded", object: { id: long } })],
    ["payment.*: object.id с переводом строки", JSON.stringify({ event: "payment.succeeded", object: { id: "p1\nПОДДЕЛКА" } })],
    ["refund.succeeded: нет object.payment_id", JSON.stringify({ event: "refund.succeeded", object: { id: "r1" } })],
    ["refund.succeeded: object.payment_id не строка", JSON.stringify({ event: "refund.succeeded", object: { id: "r1", payment_id: 5 } })],
    ["refund.succeeded: object.payment_id длиннее 100 символов", JSON.stringify({ event: "refund.succeeded", object: { id: "r1", payment_id: long } })],
    ["refund.succeeded: object.payment_id с пробелом", JSON.stringify({ event: "refund.succeeded", object: { id: "r1", payment_id: "p 1" } })],
    ["refund.succeeded: нет object.id", JSON.stringify({ event: "refund.succeeded", object: { payment_id: "p1" } })],
    ["refund.succeeded: object.id длиннее 100 символов", JSON.stringify({ event: "refund.succeeded", object: { id: long, payment_id: "p1" } })],
  ])("%s → 400, ничего не делает", async (_name, body) => {
    expect((await call(body)).status).toBe(400);
    nothingDone();
  });

  it("id ЮKassa (UUID с дефисами) и события с точками и «_» проходят проверку", async () => {
    mocks.syncPayment.mockResolvedValue({ kind: "noop", orderId: 1 });
    const id = "2d1c1c5b-000f-5000-9000-1b68e7b15f3f";
    expect((await send({ event: "payment.waiting_for_capture", object: { id } })).status).toBe(200);
    expect(mocks.syncPayment).toHaveBeenCalledExactlyOnceWith(id, "webhook");
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
    expect(mocks.syncRefund).not.toHaveBeenCalled();
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
  const object = { id: "r1", payment_id: "p1", status: "succeeded", amount: { value: "1700.00", currency: "RUB" } };
  const body = { type: "notification", event: "refund.succeeded", object: { ...object, description: "чужие данные", metadata: { x: "y" } } };

  it("отдаёт syncRefund только проверенные поля (без остального тела), эффекты — с его исходом → 200", async () => {
    const outcome = { kind: "refunded_externally", orderId: 5 };
    mocks.syncRefund.mockResolvedValue(outcome);
    const res = await send(body);
    expect(res.status).toBe(200);
    expect(mocks.syncRefund).toHaveBeenCalledExactlyOnceWith(object);
    expect(mocks.runSyncEffects).toHaveBeenCalledExactlyOnceWith(outcome);
    expect(mocks.syncPayment).not.toHaveBeenCalled();
  });

  it("строки status и amount обрезаются до 100 символов; не строки — null", async () => {
    mocks.syncRefund.mockResolvedValue({ kind: "unknown" });
    await send({ event: "refund.succeeded", object: { id: "r1", payment_id: "p1", status: "x".repeat(10_000), amount: { value: 1700, currency: "R".repeat(500) } } });
    expect(mocks.syncRefund).toHaveBeenCalledExactlyOnceWith({
      id: "r1", payment_id: "p1", status: "x".repeat(100), amount: { value: null, currency: "R".repeat(100) },
    });
  });

  it("без amount и status — null, а не ошибка", async () => {
    mocks.syncRefund.mockResolvedValue({ kind: "unknown" });
    expect((await send({ event: "refund.succeeded", object: { id: "r1", payment_id: "p1", amount: "много" } })).status).toBe(200);
    expect(mocks.syncRefund).toHaveBeenCalledExactlyOnceWith({ id: "r1", payment_id: "p1", status: null, amount: { value: null, currency: null } });
  });

  it("одиночные суррогаты и NUL (их не примет jsonb) из строк убираются", async () => {
    mocks.syncRefund.mockResolvedValue({ kind: "unknown" });
    await call(`{"event":"refund.succeeded","object":{"id":"r1","payment_id":"p1","status":"ok\\ud83d\\u0000","amount":{"value":"1.00","currency":"RUB"}}}`);
    const status = mocks.syncRefund.mock.calls[0][0].status as string;
    expect(status.isWellFormed()).toBe(true);
    expect(status).not.toContain("\u0000");
    expect(status.startsWith("ok")).toBe(true);
  });

  it("syncRefund бросает (шлюз, БД) → 500 (ЮKassa повторит), эффекты не запускаются", async () => {
    mocks.syncRefund.mockRejectedValue(new Error("ЮKassa недоступна"));
    expect((await send(body)).status).toBe(500);
    expect(mocks.runSyncEffects).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalled();
  });
});

describe("POST /api/payments/yookassa — прочие события", () => {
  it.each(["payment_method.active", "payout.succeeded", "deal.closed", "refund.failed"])("%j → 200 без действий", async (event) => {
    expect((await send({ type: "notification", event, object: { id: "x1" } })).status).toBe(200);
    nothingDone();
  });

  it("неизвестное событие без object → 200", async () => {
    expect((await send({ type: "notification", event: "deal.closed" })).status).toBe(200);
    nothingDone();
  });
});
