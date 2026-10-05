"use client";

import { useState } from "react";

export type TicketTour = {
  number: number;
  title: string;
  subtitle: string;
  route: string;
  description: string;
  note: string | null;
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
  onBook?: (sessionId: number | null) => void;
};

const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const WEEKDAYS: Record<string, string> = { Mon: "пн", Tue: "вт", Wed: "ср", Thu: "чт", Fri: "пт", Sat: "сб", Sun: "вскр" };

function moscowParts(d: Date) {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Moscow",
    weekday: "short",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return {
    day: `${Number(p.day)} ${MONTHS[Number(p.month) - 1]}`,
    weekday: WEEKDAYS[p.weekday],
    time: `${p.hour}:${p.minute}`,
  };
}

function formatRub(n: number) {
  return `${n.toLocaleString("ru-RU").replace(/ | /g, " ")} ₽`;
}

function seatsLabel(free: number) {
  const mod10 = free % 10;
  const mod100 = free % 100;
  const word = mod10 === 1 && mod100 !== 11 ? "место" : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? "места" : "мест";
  return `осталось ${free} ${word}`;
}

function Description({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let items: string[] = [];
  const flush = () => {
    if (items.length) {
      blocks.push(<ul key={`ul${blocks.length}`}>{items.map((t, i) => <li key={i}>{t}</li>)}</ul>);
      items = [];
    }
  };
  for (const line of text.split("\n")) {
    const li = line.match(/^\s*[-*]\s+(.*)$/);
    if (li) items.push(li[1]);
    else if (line.trim()) {
      flush();
      blocks.push(<p key={`p${blocks.length}`}>{line.trim()}</p>);
    }
  }
  flush();
  return <div className="t-desc">{blocks}</div>;
}

export function TicketCard({ tour, sessions, onBook }: TicketCardProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number | null>(sessions[0]?.id ?? null);

  const parts = sessions.map((s) => moscowParts(s.startsAt));
  const first = parts[0];
  const free = sessions[0]?.free ?? 0;
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
        {free > 0 && <span className="t-seats">{seatsLabel(free)}</span>}
        {first && (
          <span className="t-date">
            <b>{parts.map((p) => p.day).join(" / ")}</b>
            {first.weekday} · {first.time}
          </span>
        )}
      </div>
      <div className="perf"><span className="t-stub">№ {String(tour.number).padStart(3, "0")}</span></div>
      <div className="ticket-info">
        <div className="t-title">{tour.title}</div>
        <div className="t-tag">{tour.subtitle}</div>
        <div className="t-route">{tour.route}</div>
        {sessions.length > 1 && (
          <div className="t-dates">
            <span className="t-date-lbl">Дата:</span>
            {sessions.map((s, i) => (
              <button
                key={s.id}
                className={`t-date-chip${s.id === selected ? " active" : ""}`}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelected(s.id);
                }}
              >
                <b>{parts[i].day}</b>
                {parts[i].weekday}
              </button>
            ))}
          </div>
        )}
        <Description text={tour.description} />
        {tour.note && <div className="t-note">{tour.note}</div>}
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
          <button className="t-btn" type="button" onClick={() => onBook?.(selected)}>Купить</button>
        </div>
      </div>
    </article>
  );
}
