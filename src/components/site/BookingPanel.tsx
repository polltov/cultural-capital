"use client";

import { useEffect, useRef, useState } from "react";
import { formatDayMonth, formatTime, formatWeekday } from "@/lib/domain/moscow-time";
import { formatRub } from "@/lib/domain/pricing";
import { HOLD_MINUTES, seatsBadge } from "@/lib/domain/seats";
import { headlinePrice, priceLines } from "@/lib/domain/tour-text";
import type { CatalogSession } from "@/server/catalog";
import { useBooking } from "./Booking";

type PanelTour = { id: number; title: string; priceChild: number; priceAdult: number };

/**
 * Панель покупки на странице экскурсии: цены, даты с остатком мест и «Купить билет» на выбранную дату.
 * На телефоне, когда панель уехала вверх за экран, снизу появляется полоса с ценой и той же кнопкой.
 * `fallback` — что показать вместо кнопки, если купить нечего (дат нет или все места разобраны).
 */
export function BookingPanel({ tour, sessions, fallback }: { tour: PanelTour; sessions: CatalogSession[]; fallback: React.ReactNode }) {
  const open = useBooking();
  const firstFree = sessions.find((s) => s.free > 0) ?? null;
  const [picked, setPicked] = useState<number | null>(null);
  // Выбор выводится из данных: если выбранную дату разобрали или она ушла из афиши — ближайшая свободная.
  const selected = sessions.find((s) => s.id === picked && s.free > 0) ?? firstFree;
  const lines = priceLines(tour);

  const panel = useRef<HTMLDivElement>(null);
  const [barShown, setBarShown] = useState(false);
  const canBuy = firstFree !== null;
  useEffect(() => {
    const el = panel.current;
    if (!el || !canBuy) return;
    // Полоса нужна, только когда панель ушла ВВЕРХ за экран. Нижний край области наблюдения отодвинут далеко вниз:
    // панель «видна», пока она на экране или ниже него, и «не видна» только выше. Так состояние меняется и при прыжке
    // через всю страницу (якорь, клавиша Home) — обычный наблюдатель такой прыжок не заметил бы, и полоса бы залипла.
    const io = new IntersectionObserver(([e]) => setBarShown(!e.isIntersecting), { rootMargin: "0px 0px 100000px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [canBuy]);

  const buy = () => selected && open(tour.id, selected.id);

  return (
    <>
      <div className="booking" id="booking" ref={panel}>
        <p className="booking-kicker">Билеты</p>
        <dl className="booking-prices">
          {lines.map((l) => (
            <div key={l.label}><dt>{l.label}</dt><dd>{formatRub(l.price)}</dd></div>
          ))}
        </dl>
        {/* Даты показываем и когда всё распродано: видно, что экскурсия идёт, просто мест уже нет */}
        {sessions.length > 0 && (
          <fieldset className="booking-field">
            <legend className="booking-h">{firstFree ? "Выберите дату" : "Ближайшие даты"}</legend>
            <div className="booking-dates">
              {sessions.map((s) => {
                const off = s.free <= 0;
                return (
                  <label key={s.id} className={`date-chip${off ? " is-off" : ""}`}>
                    <input type="radio" name="tour-date" value={s.id} checked={selected?.id === s.id} disabled={off} onChange={() => setPicked(s.id)} />
                    <span>
                      <span><b>{formatDayMonth(s.startsAt)}, {formatWeekday(s.startsAt)}</b> · {formatTime(s.startsAt)}</span>
                      <small className={!off && s.free <= 4 ? "is-low" : undefined}>{off ? "мест нет" : (seatsBadge(s.free) ?? `свободно ${s.free}`)}</small>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}
        {firstFree ? (
          <>
            <button type="button" className="btn btn--dark btn--block" onClick={buy}>Купить билет</button>
            <p className="booking-note">Оплата картой или по СБП. Места держатся за вами {HOLD_MINUTES} минут, билет и чек придут на почту.</p>
          </>
        ) : (
          fallback
        )}
      </div>
      {firstFree && (
        <div className={`buybar${barShown ? " is-shown" : ""}`} inert={!barShown}>
          <p className="buybar-price">
            {headlinePrice(tour).price}
            <small>{selected ? `${formatDayMonth(selected.startsAt)}, ${formatWeekday(selected.startsAt)}, ${formatTime(selected.startsAt)}` : ""}</small>
          </p>
          <button type="button" className="btn btn--dark btn--sm" onClick={buy}>Купить билет</button>
        </div>
      )}
    </>
  );
}
