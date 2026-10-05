import { TicketCard } from "./TicketCard";
import type { CatalogTour } from "@/server/catalog";


export function Catalog({ items }: { items: CatalogTour[] }) {
  return (
    <>
      <div className="section-h" id="catalog">
        <div className="kicker">каталог</div>
        <div className="stitle">Наши <em>экскурсии</em></div>
        <div className="sdesc">Каждая прогулка — как маленький спектакль: сюжет, герои и город, который открывается заново.</div>
      </div>
      <div className="catalog">
        {items.map(({ tour, sessions }, i) => (
          <TicketCard key={tour.id} tour={tour} sessions={sessions} number={i + 1} />
        ))}
      </div>
    </>
  );
}
