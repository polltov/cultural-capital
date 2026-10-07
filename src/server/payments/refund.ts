import { refundItems } from "@/lib/domain/receipt";
import { vatCode } from "./gateway";
import type { GatewayRefund, PaymentGateway } from "./types";

/**
 * Возврат с чеком возврата (54-ФЗ) — общая часть ручного возврата (`refundOrder`) и автовозврата поздней оплаты (`syncPayment`).
 * Бросает, если у заказа нет email для чека, ставка НДС неверна, шлюз не ответил или ЮKassa отклонила возврат (`canceled`);
 * `pending` и `succeeded` — успех. Выбор шлюза и перехват ошибок — на стороне вызывающего.
 */
export async function createReceiptRefund(
  gateway: PaymentGateway,
  r: { idempotenceKey: string; paymentId: string; amount: number; email: string | null; tourTitle: string; startsAt: Date },
): Promise<GatewayRefund> {
  if (!r.email) throw new Error("у заказа нет email для чека возврата");
  const refund = await gateway.createRefund({
    idempotenceKey: r.idempotenceKey,
    paymentId: r.paymentId,
    amount: r.amount,
    customerEmail: r.email,
    items: refundItems({ tourTitle: r.tourTitle, startsAt: r.startsAt }, r.amount, vatCode()),
  });
  if (refund.status === "canceled") throw new Error("ЮKassa отклонила возврат");
  return refund;
}
