"use client";

import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { formatRub } from "@/lib/domain/pricing";
import { formatDayMonth, formatTime, formatWeekday } from "@/lib/domain/moscow-time";
import { seatsBadge } from "@/lib/domain/seats";

export type TicketTour = {
  title: string;
  subtitle: string;
  route: string;
  description: string;
  note: string;
  durationLabel: string;
  ageLabel: string;
  coverUrl: string | null;
  priceChild: number;
  priceAdult: number;
  featured: boolean;
};

export type TicketSession = { id: number; startsAt: Date; free: number };

export type TicketCardProps = {
  tour: TicketTour;
  sessions: TicketSession[];
  /** Порядковый номер на перфорации (№ 00N). */
  number?: number;
  onBook?: (sessionId: number | null) => void;
};

function Description({ text }: { text: string }) {
  return (
    <div className="t-desc">
      <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>
    </div>
  );
}

export function TicketCard({ tour, sessions, number, onBook }: TicketCardProps) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  // Выбранный чип выводится из props: если его больше нет в sessions — первый сеанс.
  const selected = sessions.some((s) => s.id === picked) ? picked : (sessions[0]?.id ?? null);

  const first = sessions[0];
  const badge = first ? seatsBadge(first.free) : null;
  const twoPrices = tour.priceChild !== tour.priceAdult;

  const toggle = () => setOpen((o) => !o);

  return (
    // eslint-disable-next-line jsx-a11y/role-supports-aria-props -- kept from the original markup
    <article
      className={`ticket${tour.featured ? " featured" : ""}${open ? " open" : ""}`}
      tabIndex={0}
      aria-expanded={open}
      onClick={(e) => {
        const target = e.target as Element;
        if (target.closest(".t-date-chip")) return;
        if (open && target.closest(".t-btn")) return;
        toggle();
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
        e.preventDefault();
        toggle();
      }}
    >
      <div className="ticket-photo" style={tour.coverUrl ? { backgroundImage: `url("${tour.coverUrl}")` } : undefined}>
        {badge && <span className="t-seats">{badge}</span>}
        {first ? (
          <span className="t-date">
            <b>{sessions.map((s) => formatDayMonth(s.startsAt)).join(" / ")}</b>
            {formatWeekday(first.startsAt)} · {formatTime(first.startsAt)}
          </span>
        ) : (
          <span className="t-date"><b>Даты уточняются</b></span>
        )}
      </div>
      <div className="perf"><span className="t-stub">№ {String(number ?? 0).padStart(3, "0")}</span></div>
      <div className="ticket-info">
        <div className="t-title">{tour.title}</div>
        <div className="t-tag">{tour.subtitle}</div>
        <div className="t-route">{tour.route}</div>
        {sessions.length > 1 && (
          <div className="t-dates">
            <span className="t-date-lbl">Дата:</span>
            {sessions.map((s) => (
              <button
                key={s.id}
                className={`t-date-chip${s.id === selected ? " active" : ""}`}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPicked(s.id);
                }}
              >
                <b>{formatDayMonth(s.startsAt)}</b>
                {formatWeekday(s.startsAt)}
              </button>
            ))}
          </div>
        )}
        <Description text={tour.description} />
        {tour.note.trim() && <div className="t-note">{tour.note}</div>}
        <div className="t-meta">{tour.durationLabel} <i></i> {tour.ageLabel}</div>
        <div className="t-foot">
          {twoPrices ? (
            <>
              <span className="t-price t-price-compact">{formatRub(tour.priceChild)}<small>/чел</small></span>
              <div className="t-prices">
                <span className="t-price-item"><span>Детский</span><b>{formatRub(tour.priceChild)}</b></span>
                <span className="t-price-item"><span>Взрослый</span><b>{formatRub(tour.priceAdult)}</b></span>
              </div>
            </>
          ) : (
            <span className="t-price">{formatRub(tour.priceChild)}<small>/чел</small></span>
          )}
          <button
            className="t-btn"
            type="button"
            aria-disabled={sessions.length === 0}
            onClick={() => {
              if (open && sessions.length) onBook?.(selected);
            }}
          >
            Записаться
          </button>
        </div>
      </div>
    </article>
  );
}
