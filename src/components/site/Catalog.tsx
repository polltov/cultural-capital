"use client";

import { coverVariants } from "@/lib/domain/tour-text";
import type { CatalogTour } from "@/server/catalog";
import { useBooking } from "./Booking";
import { SectionHead } from "./SectionHead";
import { TicketCard } from "./TicketCard";

/** Каталог «Наши экскурсии»: карточка ведёт на страницу экскурсии, «Купить билет» — сразу в покупку. */
export function Catalog({ items }: { items: CatalogTour[] }) {
  const open = useBooking();
  const variants = coverVariants(items.map((i) => i.tour));
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
          <div className="catalog">
            {items.map(({ tour, sessions }, i) => (
              <TicketCard
                key={tour.id}
                tour={tour}
                sessions={sessions}
                number={i + 1}
                href={`/tours/${tour.slug}`}
                seed={tour.slug}
                coverVariant={variants.get(tour.slug)}
                onBook={(sessionId) => open(tour.id, sessionId)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
