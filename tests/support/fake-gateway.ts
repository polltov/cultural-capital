import { toApiAmount } from "@/lib/domain/pricing";
import {
  PaymentGatewayError,
  type CreateReceiptInput,
  type CreateRefundInput,
  type GatewayPayment,
  type PaymentGateway,
  type PaymentStatus,
} from "@/server/payments/types";

export type FakeGateway = PaymentGateway & {
  payments: Map<string, GatewayPayment>;
  refunds: CreateRefundInput[];
  receipts: CreateReceiptInput[];
  setStatus(id: string, s: PaymentStatus): void;
  /** Следующий вызов метода бросит `err` (по умолчанию PaymentGatewayError("fake failure")); повторные вызовы встают в очередь. */
  failNext(m: keyof PaymentGateway, err?: Error): void;
};

/** Подделка шлюза для интеграционных тестов: тот же интерфейс, всё хранится в памяти. */
export function fakeGateway(): FakeGateway {
  const payments = new Map<string, GatewayPayment>();
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
  /** Как настоящий шлюз, отдаём снимок: последующий setStatus не меняет ранее выданные объекты. */
  const snapshot = (p: GatewayPayment): GatewayPayment => ({ ...p, amount: { ...p.amount }, metadata: { ...p.metadata } });

  return {
    payments,
    refunds,
    receipts,

    async createPayment(i) {
      checkFailure("createPayment");
      const n = ++paymentSeq;
      const payment: GatewayPayment = {
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

    failNext(m, err = new PaymentGatewayError("fake failure")) {
      (failures[m] ??= []).push(err);
    },
  };
}
