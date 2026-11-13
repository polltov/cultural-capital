"use client";

import Link from "next/link";
import { Markdown } from "@/components/Markdown";
import "./ticket.css";
import { formatDayMonth, formatTime, formatWeekday } from "@/lib/domain/moscow-time";
import { pluralRu, seatsBadge } from "@/lib/domain/seats";
import { headlinePrice, priceLines } from "@/lib/domain/tour-text";
import { formatRub } from "@/lib/domain/pricing";
import { TourCover } from "./TourCover";

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
  /** Страница экскурсии. Без неё (превью в админке) название — просто текст. */
  href?: string;
  /** Ключ для выбора гравюры, когда нет фото; по умолчанию — название. */
  seed?: string;
  /** Номер гравюры (0–3) от каталога; без него — по `seed`. */
  coverVariant?: number;
  onBook?: (sessionId: number) => void;
};

/**
 * Даты на обложке: ближайший сеанс, на который ещё можно купить билет (если таких нет — просто ближайший),
 * его день недели и время, и сколько дат есть после него.
 */
function CoverDates({ shown, later }: { shown: TicketSession | null; later: number }) {
  if (!shown) return <span className="t-date"><b>Даты уточняются</b></span>;
  return (
    <span className="t-date">
      <b>{formatDayMonth(shown.startsAt)}</b>
      {formatWeekday(shown.startsAt)} · {formatTime(shown.startsAt)}
      {later > 0 && <em>и ещё {later} {pluralRu(later, ["дата", "даты", "дат"])}</em>}
    </span>
  );
}

export function TicketCard({ tour, sessions, number, href, seed, coverVariant, onBook }: TicketCardProps) {
  // Купить можно, пока есть хоть один сеанс с местами; покупка открывается на ближайшем таком сеансе,
  // и обложка говорит именно о нём — дата и остаток мест не расходятся с тем, что откроется в покупке.
  const bookable = sessions.find((s) => s.free > 0) ?? null;
  const shown = bookable ?? sessions[0] ?? null;
  const later = shown ? sessions.filter((s) => s.startsAt.getTime() > shown.startsAt.getTime()).length : 0;
  const badge = shown ? seatsBadge(shown.free) : null;
  const price = headlinePrice(tour);
  const lines = priceLines(tour);

  return (
    <article className={`ticket${tour.featured ? " featured" : ""}${href ? " linked" : ""}`}>
      <div className="ticket-photo">
        <TourCover
          src={tour.coverUrl}
          alt={tour.title}
          seed={seed ?? tour.title}
          variant={coverVariant}
          sizes={tour.featured ? "(max-width: 760px) 100vw, 560px" : "(max-width: 760px) 100vw, (max-width: 1100px) 50vw, 400px"}
        />
        {badge && <span className="t-seats">{badge}</span>}
        <CoverDates shown={shown} later={later} />
      </div>
      <div className="perf"><span className="t-stub">№ {String(number ?? 0).padStart(3, "0")}</span></div>
      <div className="ticket-info">
        {tour.subtitle.trim() && <p className="t-tag">{tour.subtitle}</p>}
        <h3 className="t-title">{href ? <Link className="t-link" href={href}>{tour.title}</Link> : tour.title}</h3>
        {tour.route.trim() && <p className="t-route">{tour.route}</p>}
        {tour.featured && tour.description.trim() && <Markdown className="t-desc">{tour.description}</Markdown>}
        <p className="t-meta">
          {tour.durationLabel && <span>{tour.durationLabel}</span>}
          {tour.durationLabel && tour.ageLabel && <i aria-hidden="true"></i>}
          {tour.ageLabel && <span>{tour.ageLabel}</span>}
        </p>
        <div className="t-foot">
          {tour.featured && lines.length > 1 ? (
            <dl className="t-prices">
              {lines.map((l) => (
                <div key={l.label}><dt>{l.label}</dt><dd>{formatRub(l.price)}</dd></div>
              ))}
            </dl>
          ) : (
            <p className="t-price">{price.price}{price.note && <small>{price.note}</small>}</p>
          )}
          {bookable ? (
            <button className="t-btn" type="button" onClick={() => onBook?.(bookable.id)}>Купить билет</button>
          ) : href ? (
            <Link className="t-btn t-btn--ghost" href={href}>Подробнее</Link>
          ) : (
            <span className="t-btn" aria-disabled="true">Купить билет</span>
          )}
        </div>
      </div>
    </article>
  );
}
