export const ORDER_STATUSES = ["new", "confirmed", "done", "cancelled", "awaiting_payment", "paid", "expired"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const STATUS_LABELS: Record<OrderStatus, string> = {
  new: "Новая заявка",
  confirmed: "Заявка подтверждена",
  done: "Проведён",
  cancelled: "Отменён",
  awaiting_payment: "Ждёт оплаты",
  paid: "Оплачен",
  expired: "Не оплачен",
};

/** Статус платежа ЮKassa (`orders.payment_status`) словами для админки; незнакомый статус показываем как есть. */
const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: "Ждёт оплаты",
  waiting_for_capture: "Платёж на проверке",
  succeeded: "Платёж прошёл",
  canceled: "Платёж отклонён",
};

export function paymentStatusLabel(status: string | null): string {
  return status === null ? "—" : (PAYMENT_STATUS_LABELS[status] ?? status);
}

// Только ручные переходы админа. Отмена оплаченного — через refundOrder; системные переходы
// (awaiting_payment → paid/expired/cancelled) делают syncPayment, releaseHold и ночная задача.
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  new: ["confirmed", "cancelled"],
  confirmed: ["done", "cancelled"],
  done: [],
  cancelled: [],
  awaiting_payment: [],
  paid: ["done"],
  expired: [],
};

export function nextStatuses(from: OrderStatus): OrderStatus[] {
  return [...TRANSITIONS[from]];
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}
