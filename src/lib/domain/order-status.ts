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
