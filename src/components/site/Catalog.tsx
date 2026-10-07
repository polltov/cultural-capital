"use client";

import { useRef, useState } from "react";
import { TicketCard } from "./TicketCard";
import { CheckoutDialog } from "./CheckoutDialog";
import type { CatalogTour } from "@/server/catalog";

export function Catalog({ items }: { items: CatalogTour[] }) {
  const [booking, setBooking] = useState<{ tourId: number; sessionId: number | null; n: number } | null>(null);
  const opener = useRef<Element | null>(null);
  const current = booking ? items.find((i) => i.tour.id === booking.tourId) : undefined;

  return (
    <>
      <div className="section-h" id="catalog">
        <div className="kicker">каталог</div>
        <div className="stitle">Наши <em>экскурсии</em></div>
        <div className="sdesc">Каждая прогулка — как маленький спектакль: сюжет, герои и город, который открывается заново.</div>
      </div>
      <div className="catalog">
        {items.map(({ tour, sessions }, i) => (
          <TicketCard
            key={tour.id}
            tour={tour}
            sessions={sessions}
            number={i + 1}
            onBook={(sessionId) => {
              opener.current = document.activeElement;
              setBooking((b) => ({ tourId: tour.id, sessionId, n: (b?.n ?? 0) + 1 }));
            }}
          />
        ))}
      </div>
      {booking && current && (
        <CheckoutDialog
          key={booking.n}
          tour={current.tour}
          sessions={current.sessions}
          initialSessionId={booking.sessionId}
          onClose={() => {
            setBooking(null);
            const el = opener.current;
            if (el instanceof HTMLElement && el.isConnected) el.focus();
          }}
        />
      )}
    </>
  );
}
