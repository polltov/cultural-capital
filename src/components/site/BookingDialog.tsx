"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { submitBooking } from "@/app/(site)/actions";
import { formatRub, orderTotal } from "@/lib/domain/pricing";
import { formatDayMonth, formatTime, formatWeekday } from "@/lib/domain/moscow-time";
import { maskPhone } from "@/lib/domain/phone-mask";
import type { BookingResult } from "@/lib/validation/booking";
import type { CatalogTour } from "@/server/catalog";

export type BookingDialogProps = {
  tour: CatalogTour["tour"];
  sessions: CatalogTour["sessions"];
  initialSessionId: number | null;
  onClose: () => void;
};

const MAX_PER_SIDE = 20;

function Stepper({ name, label, value, max, onChange }: {
  name: string; label: string; value: number; max: number; onChange: (n: number) => void;
}) {
  return (
    <div className="bk-stepper">
      <span className="bk-stepper-lbl">{label}</span>
      <div className="bk-stepper-ctl">
        <button type="button" aria-label={`${label}: меньше`} disabled={value <= 0} onClick={() => onChange(value - 1)}>−</button>
        <output aria-label={label}>{value}</output>
        <button type="button" aria-label={`${label}: больше`} disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>
      </div>
      <input type="hidden" name={name} value={value} />
    </div>
  );
}

export function BookingDialog({ tour, sessions, initialSessionId, onClose }: BookingDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState<BookingResult | null, FormData>(submitBooking, null);

  const [sessionId, setSessionId] = useState<number | null>(() => {
    const ok = (id: number | null) => sessions.some((s) => s.id === id && s.free > 0);
    return ok(initialSessionId) ? initialSessionId : (sessions.find((s) => s.free > 0)?.id ?? null);
  });
  const [children, setChildren] = useState(0);
  const [adults, setAdults] = useState(1);
  const [phone, setPhone] = useState("");
  // Поля контролируемые: React 19 сбрасывает форму после action, и без этого ввод пропадал бы при ошибке сервера.
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [comment, setComment] = useState("");
  const [consent, setConsent] = useState(false);

  const session = sessions.find((s) => s.id === sessionId) ?? null;
  const max = session ? Math.min(MAX_PER_SIDE, session.free) : 0;
  const ch = Math.min(children, max);
  // Суммарно не больше свободных мест: второй счётчик ограничен остатком.
  const ad = Math.min(adults, Math.max(0, max - ch));
  const total = orderTotal({ children: ch, adults: ad, priceChild: tour.priceChild, priceAdult: tour.priceAdult });

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const formError = state && !state.ok ? state.error : undefined;
  const done = state && state.ok ? state : null;

  const err = (k: string) => (errors[k] ? <div className="bk-err" id={`bk-err-${k}`} role="alert">{errors[k]}</div> : null);
  const invalid = (k: string) => (errors[k] ? { "aria-invalid": true, "aria-describedby": `bk-err-${k}` } : {});

  return (
    <dialog
      ref={ref}
      className="bk-dialog"
      aria-labelledby="bk-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) ref.current?.close();
      }}
    >
      <div className="bk-body">
        <button type="button" className="bk-x" aria-label="Закрыть" onClick={() => ref.current?.close()}>×</button>
        {done ? (
          <div className="bk-done">
            <div className="bk-title" id="bk-title">Спасибо!</div>
            <p>Номер заявки {done.number}. Мы свяжемся с вами в ближайшее время.</p>
            <button type="button" className="t-btn" onClick={() => ref.current?.close()}>Закрыть</button>
          </div>
        ) : (
          <form
            noValidate
            onSubmit={(e) => {
              // Не <form action>: React 19 сбрасывает такую форму после action, ввод пользователя пропадал бы.
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              startTransition(() => formAction(fd));
            }}
          >
            <div className="kicker">запись на экскурсию</div>
            <div className="bk-title" id="bk-title">{tour.title}</div>

            <fieldset className="bk-field">
              <legend>Сеанс</legend>
              <div className="bk-sessions">
                {sessions.map((s) => {
                  const soldOut = s.free <= 0;
                  return (
                    <label key={s.id} className={`bk-chip${soldOut ? " off" : ""}`}>
                      <input
                        type="radio"
                        name="sessionId"
                        value={s.id}
                        checked={s.id === sessionId}
                        disabled={soldOut}
                        onChange={() => setSessionId(s.id)}
                      />
                      <span>
                        {formatDayMonth(s.startsAt)}, {formatWeekday(s.startsAt)}, {formatTime(s.startsAt)}
                        {" · "}{soldOut ? "мест нет" : `свободно ${s.free}`}
                      </span>
                    </label>
                  );
                })}
              </div>
              {err("sessionId")}
            </fieldset>

            <div className="bk-steppers">
              <Stepper name="children" label="Детей" value={ch} max={Math.min(max, max - ad)} onChange={setChildren} />
              <Stepper name="adults" label="Взрослых" value={ad} max={Math.min(max, max - ch)} onChange={setAdults} />
            </div>
            {err("children")}{err("adults")}
            <div className="bk-total">Итого: <b>{formatRub(total)}</b></div>

            <label className="bk-field">
              <span>Имя</span>
              <input name="name" type="text" autoComplete="name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} {...invalid("name")} />
              {err("name")}
            </label>
            <label className="bk-field">
              <span>Телефон</span>
              <input
                name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+7 (___) ___-__-__"
                value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} {...invalid("phone")}
              />
              {err("phone")}
            </label>
            <label className="bk-field">
              <span>Email <small>(необязательно)</small></span>
              <input name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} {...invalid("email")} />
              {err("email")}
            </label>
            <label className="bk-field">
              <span>Комментарий <small>(необязательно)</small></span>
              <textarea name="comment" rows={3} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} {...invalid("comment")} />
              {err("comment")}
            </label>

            <label className="bk-consent">
              <input type="checkbox" name="consent" checked={consent} onChange={(e) => setConsent(e.target.checked)} {...invalid("consent")} />
              <span>Даю <a href="/consent" target="_blank" rel="noopener">согласие на обработку персональных данных</a> и ознакомлен(а) с <a href="/privacy" target="_blank" rel="noopener">политикой</a></span>
            </label>
            {err("consent")}

            {/* Honeypot: скрыто от людей */}
            <div className="bk-hp" aria-hidden="true">
              <input type="text" name="website" tabIndex={-1} autoComplete="off" />
            </div>

            {formError && <div className="bk-err bk-err-form" role="alert">{formError}</div>}
            <button type="submit" className="t-btn bk-submit" disabled={pending || !session}>
              {pending ? "Отправляем…" : "Записаться"}
            </button>
          </form>
        )}
      </div>
    </dialog>
  );
}
