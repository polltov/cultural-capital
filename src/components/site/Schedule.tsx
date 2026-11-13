"use client";

import Link from "next/link";
import { formatDay, formatDayMonth, formatMonthGen, formatTime, formatWeekday } from "@/lib/domain/moscow-time";
import { seatsBadge } from "@/lib/domain/seats";
import type { ScheduleItem } from "@/lib/domain/schedule";
import { headlinePrice } from "@/lib/domain/tour-text";
import type { CatalogTour } from "@/server/catalog";
import { useBooking } from "./Booking";

export type ScheduleRow = ScheduleItem<CatalogTour["tour"]>;

/**
 * Афиша: сеансы строками-билетами — корешок с датой, экскурсия, цена и остаток мест, «Купить» сразу на этот сеанс.
 * Корешок и тело — отдельные блоки: вырезы перфорации режут их, а не всю строку, и тень строки не обрезается.
 */
export function ScheduleList({ items }: { items: ScheduleRow[] }) {
  const open = useBooking();
  return (
    <ol className="bill">
      {items.map(({ tour, session }) => {
        const soldOut = session.free <= 0;
        const when = `${formatDayMonth(session.startsAt)}, ${formatWeekday(session.startsAt)}, ${formatTime(session.startsAt)}`;
        return (
          <li className={`bill-row${soldOut ? " is-off" : ""}`} key={session.id}>
            <p className="bill-date">
              <b>{formatDay(session.startsAt)}</b>
              <span>{formatMonthGen(session.startsAt)}</span>
              <span className="bill-wd">{formatWeekday(session.startsAt)}</span>
            </p>
            <div className="bill-body">
              <div className="bill-main">
                <p className="bill-meta">
                  <b>{formatTime(session.startsAt)}</b>
                  {[tour.durationLabel, tour.ageLabel].filter(Boolean).map((x) => <span key={x}>{x}</span>)}
                </p>
                <h3 className="bill-title"><Link href={`/tours/${tour.slug}`}>{tour.title}</Link></h3>
                {tour.subtitle.trim() && <p className="bill-tag">{tour.subtitle}</p>}
              </div>
              <div className="bill-side">
                <p className="bill-price">{headlinePrice(tour).price}</p>
                <p className={`bill-seats${!soldOut && session.free <= 4 ? " is-low" : ""}`}>
                  {soldOut ? "мест нет" : (seatsBadge(session.free) ?? `свободно ${session.free}`)}
                </p>
                {soldOut ? (
                  <span className="btn btn--sm btn--off" aria-disabled="true">Мест нет</span>
                ) : (
                  <button type="button" className="btn btn--sm btn--dark" aria-label={`Купить билет: ${tour.title}, ${when}`} onClick={() => open(tour.id, session.id)}>
                    Купить
                  </button>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
