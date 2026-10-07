import { afterEach, describe, expect, it, vi } from "vitest";
import { yookassaGateway } from "@/server/payments/yookassa";
import { closingReceiptsEnabled, paymentGateway, vatCode } from "@/server/payments/gateway";
import { PaymentGatewayError, type CreatePaymentInput } from "@/server/payments/types";
import { paymentItems } from "@/lib/domain/receipt";
import { fakeGateway } from "../support/fake-gateway";

const API = "https://api.yookassa.ru/v3";
const items = paymentItems(
  { tourTitle: "Эрмитаж", startsAt: new Date("2026-10-12T08:00:00Z"), children: 2, adults: 1, priceChild: 1000, priceAdult: 1270 },
  1,
  "full_prepayment",
);

/** fetchImpl-заглушка: отвечает заданным статусом/телом и записывает запросы. */
function stub(status: number, body: unknown) {
  const fetchImpl = vi.fn<typeof fetch>(async () => Response.json(body, { status }));
  const gw = yookassaGateway({ shopId: "shop", secretKey: "secret", fetchImpl });
  const call = () => {
    const [url, init] = fetchImpl.mock.calls[0];
    return { url: String(url), init: init!, headers: new Headers(init!.headers), body: init!.body ? JSON.parse(String(init!.body)) : undefined };
  };
  return { gw, fetchImpl, call };
}

const paymentInput: CreatePaymentInput = {
  idempotenceKey: "key-1",
  amount: 3270,
  description: "КС-0007 · Эрмитаж · 12.10 11:00",
  orderId: 7,
  customer: { email: "anna@example.com", phone: "+79991234567", fullName: "Анна Иванова" },
  items,
};

describe("yookassaGateway", () => {
  it("createPayment: POST /payments с Basic-авторизацией, ключом идемпотентности и встроенным подтверждением", async () => {
    const response = {
      id: "p1", status: "pending", amount: { value: "3270.00", currency: "RUB" },
      metadata: { order_id: "7" }, confirmation: { type: "embedded", confirmation_token: "ct-1" },
    };
    const { gw, call } = stub(200, response);
    const p = await gw.createPayment(paymentInput);

    const c = call();
    expect(c.url).toBe(`${API}/payments`);
    expect(c.init.method).toBe("POST");
    expect(c.headers.get("Authorization")).toBe(`Basic ${Buffer.from("shop:secret").toString("base64")}`);
    expect(c.headers.get("Idempotence-Key")).toBe("key-1");
    expect(c.headers.get("Content-Type")).toBe("application/json");
    expect(c.body).toEqual({
      amount: { value: "3270.00", currency: "RUB" },
      capture: true,
      confirmation: { type: "embedded" },
      description: "КС-0007 · Эрмитаж · 12.10 11:00",
      metadata: { order_id: "7" },
      receipt: { customer: { email: "anna@example.com", phone: "+79991234567", full_name: "Анна Иванова" }, items },
    });
    expect(p).toEqual({
      id: "p1", status: "pending", amount: { value: "3270.00", currency: "RUB" },
      metadata: { order_id: "7" }, confirmationToken: "ct-1", refundedAmount: null, raw: response,
    });
  });

  it("createPayment: без confirmation в ответе токен — null, без metadata — пустой объект", async () => {
    const { gw } = stub(200, { id: "p1", status: "succeeded", amount: { value: "3270.00", currency: "RUB" } });
    const p = await gw.createPayment(paymentInput);
    expect(p.confirmationToken).toBeNull();
    expect(p.metadata).toEqual({});
  });

  it("getPayment: GET /payments/<id> без тела и без ключа идемпотентности", async () => {
    const { gw, call } = stub(200, {
      id: "p1", status: "succeeded", amount: { value: "3270.00", currency: "RUB" }, metadata: { order_id: "7" },
    });
    const p = await gw.getPayment("p1");

    const c = call();
    expect(c.url).toBe(`${API}/payments/p1`);
    expect(c.init.method).toBe("GET");
    expect(c.init.body).toBeUndefined();
    expect(c.headers.get("Authorization")).toBe(`Basic ${Buffer.from("shop:secret").toString("base64")}`);
    expect(c.headers.has("Idempotence-Key")).toBe(false);
    expect(p).toMatchObject({ id: "p1", status: "succeeded", confirmationToken: null, refundedAmount: null });
  });

  it("getPayment: refunded_amount.value → refundedAmount, raw — разобранный ответ API как получен", async () => {
    const response = {
      id: "p1", status: "succeeded", paid: true, amount: { value: "3270.00", currency: "RUB" }, metadata: { order_id: "7" },
      refunded_amount: { value: "1635.00", currency: "RUB" }, income_amount: { value: "3171.90", currency: "RUB" },
    };
    const { gw } = stub(200, response);
    const p = await gw.getPayment("p1");
    expect(p.refundedAmount).toBe("1635.00");
    expect(p.raw).toEqual(response);
  });

  it("createRefund: POST /refunds с чеком возврата", async () => {
    const { gw, call } = stub(200, { id: "r1", status: "succeeded", payment_id: "p1" });
    const r = await gw.createRefund({ idempotenceKey: "key-2", paymentId: "p1", amount: 1635, customerEmail: "anna@example.com", items });

    const c = call();
    expect(c.url).toBe(`${API}/refunds`);
    expect(c.init.method).toBe("POST");
    expect(c.headers.get("Idempotence-Key")).toBe("key-2");
    expect(c.body).toEqual({
      payment_id: "p1",
      amount: { value: "1635.00", currency: "RUB" },
      receipt: { customer: { email: "anna@example.com" }, items },
    });
    expect(r).toEqual({ id: "r1", status: "succeeded" });
  });

  it("createReceipt: POST /receipts, закрывающий чек с зачётом предоплаты", async () => {
    const { gw, call } = stub(200, { id: "rc1", status: "pending" });
    await gw.createReceipt({ idempotenceKey: "key-3", paymentId: "p1", customerEmail: "anna@example.com", items, prepaymentAmount: 3270 });

    const c = call();
    expect(c.url).toBe(`${API}/receipts`);
    expect(c.init.method).toBe("POST");
    expect(c.headers.get("Idempotence-Key")).toBe("key-3");
    expect(c.body).toEqual({
      type: "payment",
      payment_id: "p1",
      send: true,
      customer: { email: "anna@example.com" },
      items,
      settlements: [{ type: "prepayment", amount: { value: "3270.00", currency: "RUB" } }],
    });
  });

  it("ошибка API: message — description, status — код ответа", async () => {
    const { gw } = stub(400, { type: "error", id: "e1", code: "invalid_request", description: "Invalid email", parameter: "receipt.customer.email" });
    const err = await gw.createPayment(paymentInput).catch((e) => e);
    expect(err).toBeInstanceOf(PaymentGatewayError);
    expect(err.message).toBe("Invalid email");
    expect(err.status).toBe(400);
  });

  it("ошибка API без JSON в теле: message по статусу", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("<html>Bad gateway</html>", { status: 502 }));
    const gw = yookassaGateway({ shopId: "shop", secretKey: "secret", fetchImpl });
    const err = await gw.getPayment("p1").catch((e) => e);
    expect(err).toBeInstanceOf(PaymentGatewayError);
    expect(err.message).toBe("ЮKassa: HTTP 502");
    expect(err.status).toBe(502);
  });

  it("успешный ответ не JSON: PaymentGatewayError со статусом ответа", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("ok", { status: 200 }));
    const gw = yookassaGateway({ shopId: "shop", secretKey: "secret", fetchImpl });
    const err = await gw.getPayment("p1").catch((e) => e);
    expect(err).toBeInstanceOf(PaymentGatewayError);
    expect(err.status).toBe(200);
  });

  it("сетевая ошибка и таймаут: PaymentGatewayError без status", async () => {
    for (const cause of [new TypeError("fetch failed"), new DOMException("The operation timed out.", "TimeoutError")]) {
      const fetchImpl = vi.fn<typeof fetch>(async () => { throw cause; });
      const gw = yookassaGateway({ shopId: "shop", secretKey: "secret", fetchImpl });
      const err = await gw.getPayment("p1").catch((e) => e);
      expect(err).toBeInstanceOf(PaymentGatewayError);
      expect(err.status).toBeUndefined();
      expect(err.cause).toBe(cause);
    }
  });

  it("каждый запрос получает сигнал таймаута", async () => {
    const { gw, call } = stub(200, { id: "p1", status: "pending", amount: { value: "1.00", currency: "RUB" } });
    await gw.getPayment("p1");
    expect(call().init.signal).toBeInstanceOf(AbortSignal);
  });

  it("без fetchImpl использует глобальный fetch на момент вызова", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ id: "p1", status: "pending", amount: { value: "1.00", currency: "RUB" } }),
    );
    try {
      await yookassaGateway({ shopId: "shop", secretKey: "secret" }).getPayment("p1");
      expect(spy).toHaveBeenCalledOnce();
    } finally {
      spy.mockRestore();
    }
  });
});

describe("настройки из env (gateway.ts)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("paymentGateway: без ключей — «ЮKassa не настроена», читает env в момент вызова", () => {
    vi.stubEnv("YOOKASSA_SHOP_ID", "");
    vi.stubEnv("YOOKASSA_SECRET_KEY", "");
    expect(() => paymentGateway()).toThrow("ЮKassa не настроена");
    vi.stubEnv("YOOKASSA_SHOP_ID", "shop");
    expect(() => paymentGateway()).toThrow("ЮKassa не настроена");
    vi.stubEnv("YOOKASSA_SECRET_KEY", "secret");
    expect(paymentGateway()).toMatchObject({ createPayment: expect.any(Function), getPayment: expect.any(Function) });
  });

  it("vatCode: по умолчанию 1, иначе значение из env", () => {
    vi.stubEnv("YOOKASSA_VAT_CODE", "");
    expect(vatCode()).toBe(1);
    vi.stubEnv("YOOKASSA_VAT_CODE", "4");
    expect(vatCode()).toBe(4);
    vi.stubEnv("YOOKASSA_VAT_CODE", "abc");
    expect(() => vatCode()).toThrow("YOOKASSA_VAT_CODE");
  });

  it("closingReceiptsEnabled: только RECEIPT_CLOSING=on", () => {
    vi.stubEnv("RECEIPT_CLOSING", "");
    expect(closingReceiptsEnabled()).toBe(false);
    vi.stubEnv("RECEIPT_CLOSING", "off");
    expect(closingReceiptsEnabled()).toBe(false);
    vi.stubEnv("RECEIPT_CLOSING", "on");
    expect(closingReceiptsEnabled()).toBe(true);
  });
});

describe("fakeGateway", () => {
  it("createPayment: pending-платёж pay-<n> с токеном ct-<n>, суммой и order_id; getPayment возвращает его", async () => {
    const gw = fakeGateway();
    const p1 = await gw.createPayment(paymentInput);
    const p2 = await gw.createPayment({ ...paymentInput, orderId: 8, amount: 100 });
    expect(p1).toEqual({
      id: "pay-1", status: "pending", amount: { value: "3270.00", currency: "RUB" },
      metadata: { order_id: "7" }, confirmationToken: "ct-1", refundedAmount: null,
      raw: {
        id: "pay-1", status: "pending", amount: { value: "3270.00", currency: "RUB" }, metadata: { order_id: "7" },
        confirmation: { type: "embedded", confirmation_token: "ct-1" },
      },
    });
    expect(p2).toMatchObject({ id: "pay-2", confirmationToken: "ct-2", amount: { value: "100.00", currency: "RUB" }, metadata: { order_id: "8" } });
    expect(await gw.getPayment("pay-1")).toEqual(p1);
    expect([...gw.payments.keys()]).toEqual(["pay-1", "pay-2"]);
  });

  it("setStatus меняет статус для следующих getPayment; неизвестный платёж — ошибка 404", async () => {
    const gw = fakeGateway();
    const p = await gw.createPayment(paymentInput);
    gw.setStatus(p.id, "succeeded");
    expect((await gw.getPayment(p.id)).status).toBe("succeeded");
    expect(p.status).toBe("pending"); // ранее выданный снимок не меняется
    const err = await gw.getPayment("nope").catch((e) => e);
    expect(err).toBeInstanceOf(PaymentGatewayError);
    expect(err.status).toBe(404);
    expect(() => gw.setStatus("nope", "canceled")).toThrow();
  });

  it("raw подделки следует за состоянием платежа: статус и возвращённая сумма", async () => {
    const gw = fakeGateway();
    const p = await gw.createPayment(paymentInput);
    gw.setStatus(p.id, "succeeded");
    gw.setRefunded(p.id, 1000);
    const got = await gw.getPayment(p.id);
    expect(got.refundedAmount).toBe("1000.00");
    expect(got.raw).toMatchObject({ status: "succeeded", refunded_amount: { value: "1000.00", currency: "RUB" } });
    expect(() => gw.setRefunded("nope", 1)).toThrow();
  });

  it("createRefund и createReceipt записывают вход", async () => {
    const gw = fakeGateway();
    await gw.createPayment(paymentInput); // pay-1
    const refund = { idempotenceKey: "k", paymentId: "pay-1", amount: 1635, customerEmail: "a@b.c", items };
    const receipt = { idempotenceKey: "k2", paymentId: "pay-1", customerEmail: "a@b.c", items, prepaymentAmount: 3270 };
    expect(await gw.createRefund(refund)).toEqual({ id: "ref-1", status: "succeeded" });
    expect(await gw.createRefund(refund)).toEqual({ id: "ref-2", status: "succeeded" });
    expect(await gw.createReceipt(receipt)).toBeUndefined();
    expect(gw.refunds).toEqual([refund, refund]);
    expect(gw.receipts).toEqual([receipt]);
    // успешный возврат виден в следующем getPayment (возвраты складываются)
    expect((await gw.getPayment("pay-1")).refundedAmount).toBe("3270.00");
  });

  it("failNext: следующий вызов метода падает (по умолчанию PaymentGatewayError), остальные не затронуты", async () => {
    const gw = fakeGateway();
    gw.failNext("createPayment");
    const err = await gw.createPayment(paymentInput).catch((e) => e);
    expect(err).toBeInstanceOf(PaymentGatewayError);
    expect(err.message).toBe("fake failure");
    expect(gw.payments.size).toBe(0); // упавший вызов ничего не создал
    expect((await gw.createPayment(paymentInput)).id).toBe("pay-1");

    const boom = new Error("boom");
    gw.failNext("createRefund", boom);
    await expect(gw.getPayment("pay-1")).resolves.toBeDefined();
    await expect(gw.createRefund({ idempotenceKey: "k", paymentId: "pay-1", amount: 1, customerEmail: "a@b.c", items })).rejects.toBe(boom);
    expect(gw.refunds).toHaveLength(0);
  });
});
