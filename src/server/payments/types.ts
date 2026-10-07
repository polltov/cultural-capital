import type { ReceiptItem } from "@/lib/domain/receipt";

export type PaymentStatus = "pending" | "waiting_for_capture" | "succeeded" | "canceled";

export type GatewayPayment = {
  id: string;
  status: PaymentStatus;
  amount: { value: string; currency: string };
  metadata: Record<string, string>;
  /** Токен для виджета оплаты; у платежа не в статусе `pending` его нет. */
  confirmationToken: string | null;
  /** Сумма, уже возвращённая по платежу (`refunded_amount.value`, «1700.00»); `null` — поле не пришло (возвратов нет). */
  refundedAmount: string | null;
  /** Разобранный ответ API как получен: в журнал платежей идёт целиком. */
  raw: unknown;
};

/** Суммы во входах — целые рубли; в строку для API их переводит клиент. */
export type CreatePaymentInput = {
  idempotenceKey: string;
  amount: number;
  description: string;
  orderId: number;
  customer: { email: string; phone: string; fullName: string };
  items: ReceiptItem[];
};

export type GatewayRefund = { id: string; status: "pending" | "succeeded" | "canceled" };

export type CreateRefundInput = {
  idempotenceKey: string;
  paymentId: string;
  amount: number;
  customerEmail: string;
  items: ReceiptItem[];
};

/** Закрывающий чек «Полный расчёт»: `prepaymentAmount` — сумма, зачитываемая из предоплаты. */
export type CreateReceiptInput = {
  idempotenceKey: string;
  paymentId: string;
  customerEmail: string;
  items: ReceiptItem[];
  prepaymentAmount: number;
};

export interface PaymentGateway {
  createPayment(i: CreatePaymentInput): Promise<GatewayPayment>;
  getPayment(id: string): Promise<GatewayPayment>;
  createRefund(i: CreateRefundInput): Promise<GatewayRefund>;
  createReceipt(i: CreateReceiptInput): Promise<void>;
}

/** Любой сбой обращения к платёжному провайдеру. `status` — HTTP-код ответа; у сетевых ошибок и таймаутов его нет. */
export class PaymentGatewayError extends Error {
  constructor(message: string, readonly status?: number, options?: ErrorOptions) {
    super(message, options);
    this.name = "PaymentGatewayError";
  }
}
