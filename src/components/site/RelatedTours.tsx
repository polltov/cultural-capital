"use client";

import type { CatalogTour } from "@/server/catalog";
import { useBooking } from "./Booking";
import { TicketCard } from "./TicketCard";

/**
 * «Другие экскурсии» внизу страницы экскурсии: карточки как в каталоге (крупная карточка здесь обычного размера).
 * `variants` и `numbers` считаются по всему каталогу на сервере, чтобы гравюра и номер совпадали с главной.
 */
export function RelatedTours({ items, variants, numbers }: {
  items: CatalogTour[];
  variants: Record<string, number>;
  numbers: Record<string, number>;
}) {
  const open = useBooking();
  return (
    <div className="catalog catalog--related">
      {items.map(({ tour, sessions }) => (
        <TicketCard
          key={tour.id}
          tour={{ ...tour, featured: false }}
          sessions={sessions}
          number={numbers[tour.slug]}
          href={`/tours/${tour.slug}`}
          seed={tour.slug}
          coverVariant={variants[tour.slug]}
          onBook={(sessionId) => open(tour.id, sessionId)}
        />
      ))}
    </div>
  );
}
