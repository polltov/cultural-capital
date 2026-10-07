import { toApiAmount } from "@/lib/domain/pricing";
import {
  PaymentGatewayError,
  type GatewayPayment,
  type GatewayRefund,
  type PaymentGateway,
  type PaymentStatus,
} from "./types";

const BASE_URL = "https://api.yookassa.ru/v3";
const TIMEOUT_MS = 10_000;

type ApiPayment = {
  id: string;
  status: PaymentStatus;
  amount: { value: string; currency: string };
  metadata?: Record<string, string>;
  confirmation?: { type: string; confirmation_token?: string };
  refunded_amount?: { value: string; currency: string };
};

const money = (rub: number) => ({ value: toApiAmount(rub), currency: "RUB" });

function toPayment(p: ApiPayment): GatewayPayment {
  return {
    id: p.id,
    status: p.status,
    amount: p.amount,
    metadata: p.metadata ?? {},
    confirmationToken: p.confirmation?.confirmation_token ?? null,
    refundedAmount: p.refunded_amount?.value ?? null,
    raw: p,
  };
}

/** Тонкий клиент ЮKassa API v3 на fetch: Basic-авторизация, `Idempotence-Key` на POST, таймаут 10 с. */
export function yookassaGateway(cfg: { shopId: string; secretKey: string; fetchImpl?: typeof fetch }): PaymentGateway {
  const auth = `Basic ${Buffer.from(`${cfg.shopId}:${cfg.secretKey}`).toString("base64")}`;

  async function request<T>(method: "GET" | "POST", path: string, opts: { idempotenceKey?: string; body?: unknown } = {}): Promise<T> {
    const headers: Record<string, string> = { Authorization: auth, "Content-Type": "application/json" };
    if (opts.idempotenceKey) headers["Idempotence-Key"] = opts.idempotenceKey;

    let status: number;
    let ok: boolean;
    let text: string;
    try {
      const res = await (cfg.fetchImpl ?? fetch)(`${BASE_URL}${path}`, {
        method,
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      ({ status, ok } = res);
      text = await res.text();
    } catch (e) {
      // Сеть, DNS, таймаут (в том числе при чтении тела): HTTP-статуса нет.
      throw new PaymentGatewayError(`ЮKassa недоступна: ${e instanceof Error ? e.message : String(e)}`, undefined, { cause: e });
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    if (!ok) {
      const description = (json as { description?: unknown } | undefined)?.description;
      throw new PaymentGatewayError(typeof description === "string" && description ? description : `ЮKassa: HTTP ${status}`, status);
    }
    if (json === undefined) throw new PaymentGatewayError("ЮKassa вернула ответ не в формате JSON", status);
    return json as T;
  }

  return {
    async createPayment(i) {
      const p = await request<ApiPayment>("POST", "/payments", {
        idempotenceKey: i.idempotenceKey,
        body: {
          amount: money(i.amount),
          capture: true,
          confirmation: { type: "embedded" },
          description: i.description,
          metadata: { order_id: String(i.orderId) },
          receipt: {
            customer: { email: i.customer.email, phone: i.customer.phone, full_name: i.customer.fullName },
            items: i.items,
          },
        },
      });
      return toPayment(p);
    },

    async getPayment(id) {
      return toPayment(await request<ApiPayment>("GET", `/payments/${encodeURIComponent(id)}`));
    },

    async createRefund(i) {
      const r = await request<{ id: string; status: GatewayRefund["status"] }>("POST", "/refunds", {
        idempotenceKey: i.idempotenceKey,
        body: {
          payment_id: i.paymentId,
          amount: money(i.amount),
          receipt: { customer: { email: i.customerEmail }, items: i.items },
        },
      });
      return { id: r.id, status: r.status };
    },

    async createReceipt(i) {
      await request("POST", "/receipts", {
        idempotenceKey: i.idempotenceKey,
        body: {
          type: "payment",
          payment_id: i.paymentId,
          send: true,
          customer: { email: i.customerEmail },
          items: i.items,
          settlements: [{ type: "prepayment", amount: money(i.prepaymentAmount) }],
        },
      });
    },
  };
}
