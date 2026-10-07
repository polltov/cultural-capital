import { toApiAmount } from "@/lib/domain/pricing";
import {
  PaymentGatewayError,
  type CreateReceiptInput,
  type CreateRefundInput,
  type GatewayPayment,
  type PaymentGateway,
  type PaymentStatus,
} from "@/server/payments/types";

/** Платёж в памяти подделки: `raw` собирается при выдаче, `refundedAmount` можно не задавать (= нет возвратов). */
export type StoredPayment = Omit<GatewayPayment, "raw" | "refundedAmount"> & { refundedAmount?: string | null };

export type FakeGateway = PaymentGateway & {
  payments: Map<string, StoredPayment>;
  refunds: CreateRefundInput[];
  receipts: CreateReceiptInput[];
  setStatus(id: string, s: PaymentStatus): void;
  /** Задаёт уже возвращённую по платежу сумму (целые рубли) — как будто владелец вернул деньги вручную в кабинете ЮKassa. */
  setRefunded(id: string, amount: number): void;
  /** Следующий вызов метода бросит `err` (по умолчанию PaymentGatewayError("fake failure")); повторные вызовы встают в очередь. */
  failNext(m: keyof PaymentGateway, err?: Error): void;
};

/** Подделка шлюза для интеграционных тестов: тот же интерфейс, всё хранится в памяти. */
export function fakeGateway(): FakeGateway {
  const payments = new Map<string, StoredPayment>();
  const refunds: CreateRefundInput[] = [];
  const receipts: CreateReceiptInput[] = [];
  const failures: Partial<Record<keyof PaymentGateway, Error[]>> = {};
  let paymentSeq = 0;
  let refundSeq = 0;

  /** Упавший вызов ничего не меняет: проверка стоит до побочных эффектов. */
  const checkFailure = (m: keyof PaymentGateway) => {
    const err = failures[m]?.shift();
    if (err) throw err;
  };
  /** Как настоящий шлюз, отдаём снимок: последующий setStatus не меняет ранее выданные объекты. `raw` — «ответ API» по текущему состоянию. */
  const snapshot = (p: StoredPayment): GatewayPayment => {
    const refundedAmount = p.refundedAmount ?? null;
    return {
      ...p,
      amount: { ...p.amount },
      metadata: { ...p.metadata },
      refundedAmount,
      raw: {
        id: p.id,
        status: p.status,
        amount: { ...p.amount },
        metadata: { ...p.metadata },
        ...(p.confirmationToken ? { confirmation: { type: "embedded", confirmation_token: p.confirmationToken } } : {}),
        ...(refundedAmount ? { refunded_amount: { value: refundedAmount, currency: "RUB" } } : {}),
      },
    };
  };

  return {
    payments,
    refunds,
    receipts,

    async createPayment(i) {
      checkFailure("createPayment");
      const n = ++paymentSeq;
      const payment: StoredPayment = {
        id: `pay-${n}`,
        status: "pending",
        amount: { value: toApiAmount(i.amount), currency: "RUB" },
        metadata: { order_id: String(i.orderId) },
        confirmationToken: `ct-${n}`,
      };
      payments.set(payment.id, payment);
      return snapshot(payment);
    },

    async getPayment(id) {
      checkFailure("getPayment");
      const payment = payments.get(id);
      if (!payment) throw new PaymentGatewayError("Payment not found", 404);
      return snapshot(payment);
    },

    async createRefund(i) {
      checkFailure("createRefund");
      refunds.push(i);
      // Успешный возврат виден в следующем getPayment. Платёж в подделке может и не существовать — тогда только запись входа.
      const payment = payments.get(i.paymentId);
      if (payment) payments.set(payment.id, { ...payment, refundedAmount: toApiAmount(Number(payment.refundedAmount ?? 0) + i.amount) });
      return { id: `ref-${++refundSeq}`, status: "succeeded" };
    },

    async createReceipt(i) {
      checkFailure("createReceipt");
      receipts.push(i);
    },

    setStatus(id, s) {
      const payment = payments.get(id);
      if (!payment) throw new Error(`fakeGateway: платёж ${id} не найден`);
      payments.set(id, { ...payment, status: s });
    },

    setRefunded(id, amount) {
      const payment = payments.get(id);
      if (!payment) throw new Error(`fakeGateway: платёж ${id} не найден`);
      payments.set(id, { ...payment, refundedAmount: toApiAmount(amount) });
    },

    failNext(m, err = new PaymentGatewayError("fake failure")) {
      (failures[m] ??= []).push(err);
    },
  };
}
