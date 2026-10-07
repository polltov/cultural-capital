"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { nextStatuses, type OrderStatus } from "@/lib/domain/order-status";
import { formatDayMonth, formatTime, formatWeekday } from "@/lib/domain/moscow-time";
import { formatRub } from "@/lib/domain/pricing";
import { defaultRefundAmount } from "@/lib/domain/refund-policy";
import { changeStatus, moveAction, refundAction, resendTicketAction } from "@/app/admin/(panel)/orders/actions";

const BUTTONS: Record<OrderStatus, { label: string; cls: string }> = {
  confirmed: { label: "Подтвердить", cls: "btn btn-accent" },
  done: { label: "Отметить проведённым", cls: "btn btn-accent" },
  cancelled: { label: "Отменить", cls: "btn btn-ghost" },
  new: { label: "Вернуть в новые", cls: "btn btn-ghost" },
  // Системные статусы и оплаченные: админ ими вручную не управляет (отмена оплаченного — «Отменить и вернуть»); записи нужны для типов
  awaiting_payment: { label: "Ждёт оплаты", cls: "btn btn-ghost" },
  paid: { label: "Оплачен", cls: "btn btn-ghost" },
  expired: { label: "Не оплачен", cls: "btn btn-ghost" },
};

/** Так `refundOrder` начинает ошибки ЮKassa; подсказка про кабинет нужна только им, а не отказам вроде «заказ уже не оплачен». */
const REFUND_FAILED = "Возврат не прошёл:";
const REFUND_FALLBACK =
  "Если возврат не проходит, оформите его в кабинете ЮKassa, затем снова нажмите «Отменить и вернуть» — сайт увидит возврат и закроет заказ.";

export type MoveTarget = { id: number; startsAt: Date; free: number };

type Props = {
  id: number;
  status: OrderStatus;
  total: number;
  startsAt: Date;
  /** Сеансы, куда можно перенести оплаченный заказ (`listMoveTargets`); для остальных статусов пусто. */
  moveTargets: MoveTarget[];
  /** У заказа есть токен страницы и email, то есть билет можно отправить. */
  hasTicket: boolean;
};
type Mode = "cancel" | "refund" | "move" | null;

const AMOUNT_RE = /^\d{1,9}$/;
const targetLabel = (t: MoveTarget) =>
  `${formatDayMonth(t.startsAt)}, ${formatWeekday(t.startsAt)}, ${formatTime(t.startsAt)} · свободно ${t.free}`;

export function OrderActions({ id, status, total, startsAt, moveTargets, hasTicket }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mode, setModeState] = useState<Mode>(null);
  const [amount, setAmount] = useState("");
  const [target, setTarget] = useState("");
  // Время открытия страницы — как в TourForm: в рендере часы не читаем.
  const [now] = useState(() => Date.now());

  const isPaid = status === "paid";
  // «Отметить проведённым» для оплаченного — только после начала экскурсии (сервер проверяет то же самое).
  const next = nextStatuses(status).filter((to) => !(isPaid && to === "done" && startsAt.getTime() > now));
  const canResend = hasTicket && (isPaid || status === "done");
  if (!isPaid && next.length === 0 && !canResend) return null;

  function setMode(m: Mode) {
    setFailure(null);
    setNotice(null);
    setModeState(m);
  }

  function run(call: () => Promise<{ ok: true } | { ok: false; error: string }>, onOk: () => void) {
    setFailure(null);
    setNotice(null);
    start(async () => {
      const r = await call();
      if (r.ok) onOk();
      else setFailure(r.error);
    });
  }
  // Успех: диалог закрываем сами — после переноса статус заказа прежний, и страница та же.
  const saved = () => {
    setModeState(null);
    router.replace(`/admin/orders/${id}?saved=1`);
  };

  function go(to: OrderStatus) {
    setModeState(null);
    run(() => changeStatus(id, to), saved);
  }

  function openRefund() {
    setMode("refund");
    // Сумма по правилу считается в момент открытия диалога, а не при загрузке страницы: страница могла простоять открытой.
    setAmount(String(defaultRefundAmount(total, startsAt, new Date())));
  }

  function openMove() {
    setMode("move");
    setTarget("");
  }

  const refundValid = AMOUNT_RE.test(amount.trim()) && Number(amount) <= total;
  const refundSum = refundValid ? Number(amount) : 0;

  return (
    <div className="order-actions">
      {failure && (
        <div className="banner banner--error" role="alert">
          <p>{failure}</p>
          {failure.startsWith(REFUND_FAILED) && <p>{REFUND_FALLBACK}</p>}
        </div>
      )}
      {notice && (
        <p className="banner banner--ok" role="status">
          {notice}
        </p>
      )}

      {mode === "cancel" && (
        <div className="confirm-row" role="alertdialog" aria-label="Подтверждение отмены">
          <span>Отменить заявку? Места освободятся.</span>
          <button type="button" className="btn btn-danger" disabled={pending} onClick={() => go("cancelled")}>
            Да, отменить
          </button>
          <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => setMode(null)}>
            Нет
          </button>
        </div>
      )}

      {mode === "refund" && (
        <div className="order-panel" role="dialog" aria-label="Отмена и возврат">
          <label className="field">
            <span className="field-label">Сумма возврата, ₽</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              aria-invalid={!refundValid}
              aria-describedby="refund-rule"
            />
          </label>
          <p id="refund-rule" className="muted">
            По правилу: за 24 ч и раньше — 100%, позже — 50%
          </p>
          {!refundValid && <p className="form-error">Сумма — целое число от 0 до {formatRub(total)}</p>}
          <p className="muted">Заказ будет отменён, места освободятся, клиент получит письмо об отмене.</p>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-danger"
              disabled={pending || !refundValid}
              onClick={() => run(() => refundAction(id, refundSum), saved)}
            >
              {refundValid ? `Вернуть ${formatRub(refundSum)}` : "Вернуть"}
            </button>
            <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => setMode(null)}>
              Назад
            </button>
          </div>
        </div>
      )}

      {mode === "move" && (
        <div className="order-panel" role="dialog" aria-label="Перенос заказа">
          {moveTargets.length === 0 ? (
            <p className="muted">Нет подходящих сеансов: нужен будущий сеанс этой экскурсии, где хватит мест на всех участников.</p>
          ) : (
            <>
              <label className="field">
                <span className="field-label">Новый сеанс</span>
                <select value={target} onChange={(e) => setTarget(e.target.value)}>
                  <option value="">Выберите сеанс</option>
                  {moveTargets.map((t) => (
                    <option key={t.id} value={t.id}>
                      {targetLabel(t)}
                    </option>
                  ))}
                </select>
              </label>
              <p className="muted">Оплата не меняется, клиент получит обновлённый билет на почту.</p>
            </>
          )}
          <div className="btn-row">
            {moveTargets.length > 0 && (
              <button
                type="button"
                className="btn btn-accent"
                disabled={pending || target === ""}
                onClick={() => run(() => moveAction(id, Number(target)), saved)}
              >
                Перенести
              </button>
            )}
            <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => setMode(null)}>
              Назад
            </button>
          </div>
        </div>
      )}

      {mode === null && (
        <div className="btn-row">
          {isPaid && (
            <>
              <button type="button" className="btn btn-ghost" disabled={pending} onClick={openRefund}>
                Отменить и вернуть
              </button>
              <button type="button" className="btn btn-ghost" disabled={pending} onClick={openMove}>
                Перенести
              </button>
            </>
          )}
          {next.map((to) => (
            <button
              key={to}
              type="button"
              className={BUTTONS[to].cls}
              disabled={pending}
              onClick={() => (to === "cancelled" ? setMode("cancel") : go(to))}
            >
              {BUTTONS[to].label}
            </button>
          ))}
          {canResend && (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={pending}
              onClick={() => run(() => resendTicketAction(id), () => setNotice("Билет отправлен на почту клиента"))}
            >
              Отправить билет повторно
            </button>
          )}
        </div>
      )}
    </div>
  );
}
