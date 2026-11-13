"use client";

import { createContext, use, useCallback, useRef, useState } from "react";
import type { CatalogSession, CatalogTour } from "@/server/catalog";
import { CheckoutDialog } from "./CheckoutDialog";

/** Что окну покупки нужно знать об экскурсии: название, цены и сеансы с остатком мест. */
export type BookableTour = {
  tour: Pick<CatalogTour["tour"], "id" | "title" | "priceChild" | "priceAdult">;
  sessions: Pick<CatalogSession, "id" | "startsAt" | "free">[];
};

type OpenBooking = (tourId: number, sessionId: number | null) => void;

const BookingContext = createContext<OpenBooking | null>(null);

/**
 * Одно окно покупки на страницу: его открывают обложка-подсказка в первом экране, афиша, карточки каталога
 * и панель на странице экскурсии. После закрытия фокус возвращается на кнопку, с которой начали.
 */
export function BookingProvider({ catalog, children }: { catalog: BookableTour[]; children: React.ReactNode }) {
  const [booking, setBooking] = useState<{ tourId: number; sessionId: number | null; n: number } | null>(null);
  const opener = useRef<Element | null>(null);

  const open = useCallback<OpenBooking>((tourId, sessionId) => {
    opener.current = document.activeElement;
    // n — ключ окна: повторное открытие начинает покупку с чистого листа
    setBooking((b) => ({ tourId, sessionId, n: (b?.n ?? 0) + 1 }));
  }, []);

  const current = booking ? catalog.find((c) => c.tour.id === booking.tourId) : undefined;

  return (
    <BookingContext value={open}>
      {children}
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
    </BookingContext>
  );
}

export function useBooking(): OpenBooking {
  const open = use(BookingContext);
  if (!open) throw new Error("useBooking: компонент должен быть внутри BookingProvider");
  return open;
}

/** Кнопка «Купить билет» для серверных компонентов: открывает окно покупки на нужном сеансе. */
export function BuyButton({ tourId, sessionId, className = "btn btn--dark", children = "Купить билет", label }: {
  tourId: number;
  sessionId: number | null;
  className?: string;
  children?: React.ReactNode;
  /** Доступное имя, когда видимый текст короткий («Купить») и рядом несколько таких кнопок. */
  label?: string;
}) {
  const open = useBooking();
  return (
    <button type="button" className={className} aria-label={label} onClick={() => open(tourId, sessionId)}>
      {children}
    </button>
  );
}
