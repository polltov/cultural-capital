import { STATUS_LABELS, type OrderStatus } from "@/lib/domain/order-status";

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`status status--${status}`}>{STATUS_LABELS[status]}</span>;
}
