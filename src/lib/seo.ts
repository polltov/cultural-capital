// Микроразметка schema.org (JSON-LD) для поисковиков: организация, экскурсия с её сеансами, хлебные крошки.
import { contactLinks } from "./contacts";
import { operator } from "./legal";
import { siteUrl } from "./site-url";
import { toMoscowIso } from "./domain/moscow-time";
import { priceLines, routeStops, tourMetaDescription } from "./domain/tour-text";

const NAME = "Культурная Столица";
const CITY = { "@type": "PostalAddress", addressLocality: "Санкт-Петербург", addressCountry: "RU" } as const;

/** Абсолютный адрес: ссылки в микроразметке должны быть полными. */
export const absoluteUrl = (path: string) => (/^https?:\/\//i.test(path) ? path : `${siteUrl()}${path.startsWith("/") ? "" : "/"}${path}`);

const provider = () => ({ "@type": "Organization", name: NAME, url: siteUrl() });

export function organizationLd() {
  const sameAs = contactLinks().filter((c) => c.external).map((c) => c.href);
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: NAME,
    url: siteUrl(),
    logo: absoluteUrl("/brand/icon-512.png"),
    image: absoluteUrl("/assets/dvortsovaya.jpg"),
    description: "Экскурсии по Санкт-Петербургу для детей и взрослых: авторские маршруты, маленькие группы, история через игру.",
    areaServed: { "@type": "City", name: "Санкт-Петербург" },
    address: CITY,
    ...(operator.phone.trim() ? { telephone: operator.phone.trim() } : {}),
    ...(operator.email.trim() ? { email: operator.email.trim() } : {}),
    ...(sameAs.length ? { sameAs } : {}),
  };
}

export type LdTour = {
  slug: string; title: string; subtitle: string; route: string; durationLabel: string; ageLabel: string;
  coverUrl: string | null; meetingPoint: string; priceChild: number; priceAdult: number;
};
export type LdSession = { startsAt: Date; free: number };

/** Экскурсия (TouristTrip) и каждый её будущий сеанс как событие (Event) с ценой и наличием мест. */
export function tourLd(tour: LdTour, sessions: LdSession[]) {
  const url = absoluteUrl(`/tours/${tour.slug}`);
  // без фото — фирменная картинка, а не чужая достопримечательность
  const image = absoluteUrl(tour.coverUrl ?? "/brand/og.jpg");
  const description = tourMetaDescription(tour);
  const offers = (available: boolean) =>
    priceLines(tour).map((l) => ({
      "@type": "Offer",
      name: l.label === "Билет" ? "Билет" : `${l.label} билет`,
      price: l.price.toFixed(2),
      priceCurrency: "RUB",
      url,
      availability: available ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
    }));
  const stops = routeStops(tour.route);
  const trip = {
    "@context": "https://schema.org",
    "@type": "TouristTrip",
    name: tour.title,
    description,
    url,
    image,
    provider: provider(),
    ...(stops.length
      ? {
          itinerary: {
            "@type": "ItemList",
            itemListElement: stops.map((name, i) => ({ "@type": "ListItem", position: i + 1, item: { "@type": "TouristAttraction", name } })),
          },
        }
      : {}),
    offers: offers(sessions.some((s) => s.free > 0)),
  };
  const events = sessions.map((s) => ({
    "@context": "https://schema.org",
    "@type": "Event",
    name: tour.title,
    description,
    startDate: toMoscowIso(s.startsAt),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: { "@type": "Place", name: tour.meetingPoint.trim() || "Санкт-Петербург", address: CITY },
    image: [image],
    url,
    organizer: provider(),
    offers: offers(s.free > 0),
  }));
  return [trip, ...events];
}

export function breadcrumbLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: absoluteUrl(it.path) })),
  };
}

/** Markdown ответа → обычный текст для микроразметки: без звёздочек, решёток, маркеров списков и адресов ссылок. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, "")
    .replace(/(\*\*|__|\*|_|`|~~)(?=\S)(.+?)(?<=\S)\1/g, "$2")
    .replace(/\s*\n+\s*/g, " ")
    .trim();
}

/** Вопросы и ответы с главной (FAQPage) — их показывает в поиске Яндекс. Пустые вопросы и ответы пропускаются. */
export function faqLd(items: { question: string; answer: string }[]) {
  const mainEntity = items
    .map((q) => ({ name: q.question.trim(), text: plainText(q.answer) }))
    .filter((q) => q.name && q.text)
    .map((q) => ({ "@type": "Question", name: q.name, acceptedAnswer: { "@type": "Answer", text: q.text } }));
  return mainEntity.length ? { "@context": "https://schema.org", "@type": "FAQPage", mainEntity } : null;
}

/** JSON для <script type="application/ld+json">: «<» экранируется, чтобы текст из админки не закрыл тег. */
export function ldJson(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
