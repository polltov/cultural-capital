"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { nextStatuses, type OrderStatus } from "@/lib/domain/order-status";
import { changeStatus } from "@/app/admin/(panel)/orders/actions";

const BUTTONS: Record<OrderStatus, { label: string; cls: string }> = {
  confirmed: { label: "Подтвердить", cls: "btn btn-accent" },
  done: { label: "Отметить проведённой", cls: "btn btn-accent" },
  cancelled: { label: "Отменить", cls: "btn btn-ghost" },
  new: { label: "Вернуть в новые", cls: "btn btn-ghost" },
};

export function OrderActions({ id, status }: { id: number; status: OrderStatus }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const next = nextStatuses(status);
  if (next.length === 0) return null;

  function go(to: OrderStatus) {
    setError(null);
    setConfirmCancel(false);
    start(async () => {
      const r = await changeStatus(id, to);
      if (r.ok) router.replace(`/admin/orders/${id}?saved=1`);
      else setError(r.error);
    });
  }

  return (
    <div className="order-actions">
      {error && (
        <p className="banner banner--error" role="alert">
          {error}
        </p>
      )}
      {confirmCancel ? (
        <div className="confirm-row" role="alertdialog" aria-label="Подтверждение отмены">
          <span>Отменить заявку? Места освободятся.</span>
          <button type="button" className="btn btn-danger" disabled={pending} onClick={() => go("cancelled")}>
            Да, отменить
          </button>
          <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => setConfirmCancel(false)}>
            Нет
          </button>
        </div>
      ) : (
        <div className="btn-row">
          {next.map((to) => (
            <button
              key={to}
              type="button"
              className={BUTTONS[to].cls}
              disabled={pending}
              onClick={() => (to === "cancelled" ? setConfirmCancel(true) : go(to))}
            >
              {BUTTONS[to].label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
