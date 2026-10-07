"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { releaseHoldAction, startCheckoutAction } from "@/app/(site)/actions";
import { formatRub, orderTotal } from "@/lib/domain/pricing";
import { formatDayMonth, formatTime, formatWeekday } from "@/lib/domain/moscow-time";
import { maskPhone } from "@/lib/domain/phone-mask";
import { formatComposition } from "@/lib/domain/seats";
import type { CatalogTour } from "@/server/catalog";
import { PaymentWidget } from "./PaymentWidget";

export type CheckoutDialogProps = {
  tour: CatalogTour["tour"];
  sessions: CatalogTour["sessions"];
  initialSessionId: number | null;
  onClose: () => void;
};

type Step = "date" | "tickets" | "pay";
const STEPS: { id: Step; label: string }[] = [
  { id: "date", label: "Дата" },
  { id: "tickets", label: "Билеты" },
  { id: "pay", label: "Оплата" },
];

const MAX_PER_SIDE = 20;
const NETWORK_ERROR = "Не удалось отправить заказ. Проверьте соединение и попробуйте ещё раз.";
// Тексты startCheckout: данные каталога на странице устарели — места разобрали или сеанс закрыли.
const SEATS_ERROR = /^(Осталось мест: \d+|Мест не осталось)$/;
const UNAVAILABLE_ERROR = "Этот сеанс недоступен для покупки";

/** Всё, что уходит на сервер. Хранится и в состоянии формы, и в удержании — для повторной отправки. */
type Fields = {
  sessionId: number; children: number; adults: number;
  name: string; phone: string; email: string; consent: boolean; website: string;
};

type Hold = {
  orderToken: string;
  confirmationToken: string;
  /** Конец удержания по часам сервера, мс. */
  expiresAt: number;
  /** Что ушло на сервер и как это называлось: каталог после покупки пересчитывается под удержание, брать оттуда уже нельзя. */
  fields: Fields;
  summary: string;
  phase: "paying" | "expired" | "failed";
};

function toFormData(f: Fields): FormData {
  const fd = new FormData();
  fd.set("sessionId", String(f.sessionId));
  fd.set("children", String(f.children));
  fd.set("adults", String(f.adults));
  fd.set("name", f.name);
  fd.set("phone", f.phone);
  fd.set("email", f.email);
  if (f.consent) fd.set("consent", "on");
  fd.set("website", f.website);
  return fd;
}

function Stepper({ label, value, max, onChange }: {
  label: string; value: number; max: number; onChange: (n: number) => void;
}) {
  return (
    <div className="bk-stepper">
      <span className="bk-stepper-lbl">{label}</span>
      <div className="bk-stepper-ctl">
        <button type="button" aria-label={`${label}: меньше`} disabled={value <= 0} onClick={() => onChange(value - 1)}>−</button>
        <output aria-label={label}>{value}</output>
        <button type="button" aria-label={`${label}: больше`} disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>
      </div>
    </div>
  );
}

/** «Места за вами ещё 14:59». По нулю сообщает родителю один раз. */
function HoldTimer({ expiresAt, onExpire }: { expiresAt: number; onExpire: () => void }) {
  const [left, setLeft] = useState(() => expiresAt - Date.now());
  const expire = useEffectEvent(onExpire);

  useEffect(() => {
    const id = setInterval(() => {
      const ms = expiresAt - Date.now();
      setLeft(ms);
      if (ms <= 0) {
        clearInterval(id);
        expire();
      }
    }, 500);
    return () => clearInterval(id);
  }, [expiresAt]);

  // Округляем вверх: «00:00» показываем только в момент, когда время вышло.
  const sec = Math.max(0, Math.ceil(left / 1000));
  const mmss = `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
  return <span className="bk-timer" role="timer">Места за вами ещё {mmss}</span>;
}

export function CheckoutDialog({ tour, sessions, initialSessionId, onClose }: CheckoutDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const stepsRef = useRef<HTMLOListElement>(null);
  const router = useRouter();

  const [step, setStep] = useState<Step>("date");
  // Предвыбор — только если дата из карточки ещё продаётся; иначе клиент выбирает сам.
  const [sessionId, setSessionId] = useState<number | null>(() =>
    sessions.some((s) => s.id === initialSessionId && s.free > 0) ? initialSessionId : null,
  );
  const [children, setChildren] = useState(0);
  const [adults, setAdults] = useState(1);
  // Поля контролируемые и отправляются из состояния, а не <form action>: React 19 сбрасывает такую форму после action,
  // и без этого ввод пропадал бы при ошибке сервера.
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");

  const [hold, setHold] = useState<Hold | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<string, string>>>({});
  const [working, setWorking] = useState<"start" | "release" | null>(null);
  // Синхронная защита от двойной отправки: `working` меняется только после перерисовки, а два клика приходят раньше.
  const busy = useRef(false);

  // Сеанс, которого уже нет в каталоге или который распродан, выбранным не считается.
  const session = sessions.find((s) => s.id === sessionId && s.free > 0) ?? null;
  const free = session?.free ?? 0;
  const ch = Math.min(children, MAX_PER_SIDE, free);
  // Суммарно не больше свободных мест: второй счётчик ограничен остатком.
  const ad = Math.min(adults, MAX_PER_SIDE, free - ch);
  const total = orderTotal({ children: ch, adults: ad, priceChild: tour.priceChild, priceAdult: tour.priceAdult });
  const summary = session
    ? `${tour.title} · ${formatDayMonth(session.startsAt)}, ${formatWeekday(session.startsAt)}, ${formatTime(session.startsAt)} · ${formatComposition(ch, ad)} · ${formatRub(total)}`
    : tour.title;

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  // Смена шага (и возврат к форме после удержания) убирает кнопку, на которой стоял фокус: ставим его на название шага.
  const shown = useRef({ step, holding: false });
  useEffect(() => {
    const holding = hold !== null;
    if (shown.current.step === step && shown.current.holding === holding) return;
    shown.current = { step, holding };
    stepsRef.current?.querySelector<HTMLElement>('[aria-current="step"]')?.focus();
  }, [step, hold]);

  const go = (to: Step) => {
    setError(null);
    setFieldErrors({});
    setStep(to);
  };

  async function start(fields: Fields, label: string) {
    if (busy.current) return;
    busy.current = true;
    setWorking("start");
    setError(null);
    setFieldErrors({});
    try {
      const result = await startCheckoutAction(null, toFormData(fields));
      if (result.ok) {
        setHold({
          orderToken: result.orderToken, confirmationToken: result.confirmationToken,
          expiresAt: new Date(result.holdExpiresAt).getTime(), fields, summary: label, phase: "paying",
        });
        return;
      }
      const errors = result.fieldErrors ?? {};
      setFieldErrors(errors);
      setError(result.error ?? null);
      if (result.error && SEATS_ERROR.test(result.error)) setStep("tickets");
      else if (result.error === UNAVAILABLE_ERROR || errors.sessionId) setStep("date");
      else if (errors.children || errors.adults) setStep("tickets");
      // Каталог на странице устарел — просим сервер перерисовать его, чтобы остатки и даты стали актуальными.
      if (result.error && (SEATS_ERROR.test(result.error) || result.error === UNAVAILABLE_ERROR)) router.refresh();
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      busy.current = false;
      setWorking(null);
    }
  }

  /** Снимает удержание и возвращает редактируемую форму; форма остаётся закрытой, пока места не освобождены. */
  async function release(h: Hold) {
    busy.current = true;
    setWorking("release");
    try {
      await releaseHoldAction(h.orderToken);
    } catch {
      // Не вышло — места освободятся сами, когда истечёт удержание.
    }
    setHold(null);
    setWorking(null);
    busy.current = false;
  }

  const change = async () => {
    if (hold && !busy.current) await release(hold);
  };
  // «Попробовать снова»: старое удержание снимаем, чтобы оно не мешало новому, и отправляем те же данные.
  const retry = async () => {
    if (!hold || busy.current) return;
    const h = hold;
    await release(h);
    await start(h.fields, h.summary);
  };

  const errMsg = (k: string) =>
    fieldErrors[k] ? <div className="bk-err" id={`bk-err-${k}`} role="alert">{fieldErrors[k]}</div> : null;
  const invalid = (k: string) => (fieldErrors[k] ? { "aria-invalid": true, "aria-describedby": `bk-err-${k}` } : {});
  const formError = error ? <div className="bk-err bk-err-form" role="alert">{error}</div> : null;

  const locked = hold !== null;
  const stepIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <dialog
      ref={ref}
      className="bk-dialog"
      aria-labelledby="bk-title"
      onClose={onClose}
      onClick={(e) => {
        // Пока идёт оплата, случайный клик мимо окна её не бросает: закрыть можно крестиком или Esc.
        if (e.target === e.currentTarget && !hold) ref.current?.close();
      }}
    >
      <div className="bk-body">
        <button type="button" className="bk-x" aria-label="Закрыть" onClick={() => ref.current?.close()}>×</button>
        <div className="kicker">покупка билетов</div>
        <div className="bk-title" id="bk-title">{tour.title}</div>

        <ol className="bk-steps" ref={stepsRef} aria-label="Шаги покупки">
          {STEPS.map((s, i) => (
            <li
              key={s.id}
              className={i < stepIndex ? "done" : undefined}
              aria-current={s.id === step ? "step" : undefined}
              tabIndex={-1}
            >
              {s.label}
            </li>
          ))}
        </ol>

        {step === "date" && (
          <>
            <fieldset className="bk-field">
              <legend>Выберите дату</legend>
              <div className="bk-sessions">
                {sessions.map((s) => {
                  const soldOut = s.free <= 0;
                  return (
                    <label key={s.id} className={`bk-chip${soldOut ? " off" : ""}`}>
                      <input
                        type="radio"
                        name="bk-session"
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
              {errMsg("sessionId")}
            </fieldset>
            {formError}
            <div className="bk-nav">
              <button type="button" className="t-btn bk-next" disabled={!session} onClick={() => go("tickets")}>Далее</button>
            </div>
          </>
        )}

        {step === "tickets" && (
          <>
            <div className="bk-steppers">
              <Stepper label="Детских" value={ch} max={Math.min(MAX_PER_SIDE, free - ad)} onChange={(n) => { setError(null); setChildren(n); }} />
              <Stepper label="Взрослых" value={ad} max={Math.min(MAX_PER_SIDE, free - ch)} onChange={(n) => { setError(null); setAdults(n); }} />
            </div>
            {errMsg("children")}{errMsg("adults")}
            <div className="bk-total">Итого: <b>{formatRub(total)}</b></div>
            {formError}
            <div className="bk-nav">
              <button type="button" className="bk-back" onClick={() => go("date")}>Назад</button>
              <button type="button" className="t-btn bk-next" disabled={!session || ch + ad === 0} onClick={() => go("pay")}>Далее</button>
            </div>
          </>
        )}

        {step === "pay" && (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (!session || locked) return;
              void start({ sessionId: session.id, children: ch, adults: ad, name, phone, email, consent, website }, summary);
            }}
          >
            <p className="bk-summary">{hold ? hold.summary : summary}</p>

            <div className="bk-field">
              <label htmlFor="bk-name">Имя</label>
              <input id="bk-name" name="name" type="text" autoComplete="name" maxLength={80} readOnly={locked}
                value={name} onChange={(e) => setName(e.target.value)} {...invalid("name")} />
              {errMsg("name")}
            </div>
            <div className="bk-field">
              <label htmlFor="bk-phone">Телефон</label>
              <input id="bk-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+7 (___) ___-__-__" readOnly={locked}
                value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} {...invalid("phone")} />
              {errMsg("phone")}
            </div>
            <div className="bk-field">
              <label htmlFor="bk-email">Email <small>сюда придут билет и чек</small></label>
              <input id="bk-email" name="email" type="email" autoComplete="email" readOnly={locked}
                value={email} onChange={(e) => setEmail(e.target.value)} {...invalid("email")} />
              {errMsg("email")}
            </div>

            <label className="bk-consent">
              <input type="checkbox" name="consent" checked={consent} disabled={locked}
                onChange={(e) => setConsent(e.target.checked)} {...invalid("consent")} />
              <span>Даю <a href="/consent" target="_blank" rel="noopener">согласие на обработку персональных данных</a> и ознакомлен(а) с <a href="/privacy" target="_blank" rel="noopener">политикой</a></span>
            </label>
            {errMsg("consent")}

            {/* Honeypot: скрыто от людей */}
            <div className="bk-hp" aria-hidden="true">
              <input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
            </div>

            {hold ? (
              <div className="bk-hold">
                {hold.phase === "paying" && (
                  <>
                    <div className="bk-hold-bar">
                      <HoldTimer expiresAt={hold.expiresAt} onExpire={() => setHold((h) => (h ? { ...h, phase: "expired" } : h))} />
                      <button type="button" className="bk-link" disabled={working !== null} onClick={change}>← Изменить</button>
                    </div>
                    <PaymentWidget
                      confirmationToken={hold.confirmationToken}
                      returnUrl={`${window.location.origin}/order/${hold.orderToken}`}
                      onError={() => setHold((h) => (h ? { ...h, phase: "failed" } : h))}
                    />
                  </>
                )}
                {hold.phase === "expired" && (
                  <div className="bk-hold-msg">
                    <p role="alert">Время на оплату истекло</p>
                    <button type="button" className="t-btn" disabled={working !== null} onClick={change}>Начать заново</button>
                  </div>
                )}
                {hold.phase === "failed" && (
                  <div className="bk-hold-msg">
                    <p role="alert">Не удалось загрузить форму оплаты</p>
                    <button type="button" className="t-btn" disabled={working !== null} onClick={retry}>Попробовать снова</button>
                    <button type="button" className="bk-link" disabled={working !== null} onClick={change}>← Изменить</button>
                  </div>
                )}
              </div>
            ) : (
              <>
                {formError}
                <button type="submit" className="t-btn bk-submit" disabled={working !== null || !session}>
                  {working === "start" ? "Переходим к оплате…" : `Перейти к оплате · ${formatRub(total)}`}
                </button>
                <p className="bk-offer">
                  Нажимая кнопку, вы принимаете условия <a href="/offer" target="_blank" rel="noopener">договора-оферты</a>
                </p>
                <div className="bk-nav">
                  <button type="button" className="bk-back" disabled={working !== null} onClick={() => go("tickets")}>Назад</button>
                </div>
              </>
            )}
          </form>
        )}
      </div>
    </dialog>
  );
}
