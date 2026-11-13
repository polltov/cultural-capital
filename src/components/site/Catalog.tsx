"use client";

import { cellClass, loneCards } from "@/lib/domain/catalog-layout";
import { coverVariants } from "@/lib/domain/tour-text";
import type { CatalogTour } from "@/server/catalog";
import { useBooking } from "./Booking";
import { SectionHead } from "./SectionHead";
import { TicketCard } from "./TicketCard";
import { OPEN_TOUR } from "./transitions";

/**
 * Сетка карточек-билетов. Крупная карточка занимает ряд целиком; обычная, оставшаяся одна в ряду, — тоже
 * (см. `loneCards`), и в широкой ячейке билет сам ложится горизонтально (ticket.css, контейнер `cell`).
 * `variants` и `numbers` считаются по всему каталогу, чтобы гравюра и номер билета совпадали на всех страницах.
 */
export function TicketGrid({ items, variants, numbers, flat = false }: {
  items: CatalogTour[];
  variants: Record<string, number>;
  numbers: Record<string, number>;
  /**
   * Все карточки обычного размера и без анимации перехода — для блока «Другие экскурсии»: переход к соседней
   * экскурсии не движение «вглубь», а обложку этой страницы карточки отнимать не должны (имя перехода одно).
   */
  flat?: boolean;
}) {
  const open = useBooking();
  const cards = items.map(({ tour, sessions }) => ({ tour: flat ? { ...tour, featured: false } : tour, sessions }));
  const lone = loneCards(cards.map((c) => c.tour));
  return (
    <div className="catalog">
      {cards.map(({ tour, sessions }, i) => (
        <div className={cellClass(tour.featured, lone[i])} key={tour.id}>
          <TicketCard
            tour={tour}
            sessions={sessions}
            number={numbers[tour.slug]}
            href={`/tours/${tour.slug}`}
            seed={tour.slug}
            coverVariant={variants[tour.slug]}
            onBook={(sessionId) => open(tour.id, sessionId)}
            linkTransition={flat ? undefined : OPEN_TOUR}
            morphSlug={flat ? undefined : tour.slug}
          />
        </div>
      ))}
    </div>
  );
}

/** Каталог «Наши экскурсии»: карточка ведёт на страницу экскурсии, «Купить билет» — сразу в покупку. */
export function Catalog({ items }: { items: CatalogTour[] }) {
  const variants = Object.fromEntries(coverVariants(items.map((i) => i.tour)));
  const numbers = Object.fromEntries(items.map((c, i) => [c.tour.slug, i + 1]));
  return (
    <section className="catalog-sec" id="catalog" aria-labelledby="catalog-title">
      <div className="wrap">
        <SectionHead
          kicker="Каталог"
          id="catalog-title"
          title={<>Наши <em>экскурсии</em></>}
          lead="Каждая прогулка — как маленький спектакль: сюжет, герои и город, который открывается заново."
        />
        {items.length === 0 ? (
          <p className="empty">Скоро здесь появятся новые маршруты.</p>
        ) : (
          <TicketGrid items={items} variants={variants} numbers={numbers} />
        )}
      </div>
    </section>
  );
}
