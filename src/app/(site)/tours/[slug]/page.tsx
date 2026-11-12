import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Markdown } from "@/components/Markdown";
import { BookingProvider } from "@/components/site/Booking";
import { BookingPanel } from "@/components/site/BookingPanel";
import { JsonLd } from "@/components/site/JsonLd";
import { RelatedTours } from "@/components/site/RelatedTours";
import { SectionHead } from "@/components/site/SectionHead";
import { SiteShell } from "@/components/site/SiteShell";
import { ContactButtons } from "@/components/site/StaticSections";
import { TourCover } from "@/components/site/TourCover";
import { IconAge, IconArrow, IconBag, IconClock, IconGroup, IconInfo, IconPin, IconReturn, IconTicket } from "@/components/site/icons";
import { contactLinks } from "@/lib/contacts";
import { CANCEL_TERMS } from "@/lib/domain/refund-policy";
import { coverVariants, headlinePrice, routeStops, tourMetaDescription } from "@/lib/domain/tour-text";
import { breadcrumbLd, tourLd } from "@/lib/seo";
import { findTour, getPublishedCatalog } from "@/server/catalog";

// Как и главная: даты и свободные места обновляются раз в 5 минут, а после покупок и правок в админке — сразу.
export const revalidate = 300;
// Страницы строятся по первому запросу и дальше кэшируются (ISR).
export const generateStaticParams = async () => [];

// Метаданные и страница — один запрос каталога на рендер.
const loadCatalog = cache(() => getPublishedCatalog());

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const item = findTour(await loadCatalog(), (await params).slug);
  if (!item) return { title: "Экскурсия не найдена" };
  const { tour } = item;
  const description = tourMetaDescription(tour);
  return {
    title: tour.title,
    description,
    alternates: { canonical: `/tours/${tour.slug}` },
    openGraph: {
      type: "website",
      siteName: "Культурная Столица",
      locale: "ru_RU",
      title: `${tour.title} — экскурсия по Петербургу`,
      description,
      // картинка превью — opengraph-image.tsx рядом: название и обложка экскурсии в фирменном стиле
    },
  };
}

/** Факты экскурсии в первом экране: только заполненные. */
function Facts({ items }: { items: { icon: React.ReactNode; label: string; value: string }[] }) {
  return (
    <ul className="tour-facts">
      {items.map((f) => (
        <li key={f.label}>{f.icon}<span>{f.label}</span><b>{f.value}</b></li>
      ))}
    </ul>
  );
}

function SoldOut({ hasDates }: { hasDates: boolean }) {
  const hasContacts = contactLinks().length > 0;
  return (
    <div className="booking-empty">
      <p>{hasDates ? "Все места на ближайшие даты разобраны." : "Даты этой экскурсии скоро появятся."}</p>
      {hasContacts && (
        <>
          <p>Напишите нам — сообщим о новых датах или проведём экскурсию для вашей семьи.</p>
          <ContactButtons />
        </>
      )}
    </div>
  );
}

export default async function TourPage({ params }: Props) {
  const { slug } = await params;
  const catalog = await loadCatalog();
  const item = findTour(catalog, slug);
  if (!item) notFound();

  const { tour, sessions } = item;
  const variants = Object.fromEntries(coverVariants(catalog.map((c) => c.tour)));
  const numbers = Object.fromEntries(catalog.map((c, i) => [c.tour.slug, i + 1]));
  const related = catalog.filter((c) => c.tour.id !== tour.id).slice(0, 3);
  const stops = routeStops(tour.route);
  const meetingPoint = tour.meetingPoint.trim();
  const bring = tour.whatToBring.trim();
  const groupSize = sessions.length > 0 ? Math.max(...sessions.map((s) => s.capacity)) : null;
  const price = headlinePrice(tour);

  const facts = [
    tour.durationLabel.trim() && { icon: <IconClock />, label: "Длительность", value: tour.durationLabel.trim() },
    tour.ageLabel.trim() && { icon: <IconAge />, label: "Возраст", value: tour.ageLabel.trim() },
    groupSize && { icon: <IconGroup />, label: "Группа", value: `до ${groupSize} человек` },
    meetingPoint && { icon: <IconPin />, label: "Старт", value: meetingPoint },
  ].filter((f): f is { icon: React.ReactElement; label: string; value: string } => Boolean(f));

  return (
    <SiteShell cta={{ href: "#booking", label: "Купить билет" }}>
      <JsonLd data={[...tourLd(tour, sessions), breadcrumbLd([{ name: "Главная", path: "/" }, { name: "Экскурсии", path: "/#catalog" }, { name: tour.title, path: `/tours/${tour.slug}` }])]} />
      <BookingProvider catalog={catalog}>
        <div className="wrap">
          <nav className="crumbs" aria-label="Навигационная цепочка">
            <ol>
              <li><Link href="/">Главная</Link></li>
              <li><Link href="/#catalog">Экскурсии</Link></li>
              <li aria-current="page">{tour.title}</li>
            </ol>
          </nav>
        </div>

        <section className="tour-hero" aria-labelledby="tour-title">
          <div className="wrap tour-hero-grid">
            <div className="tour-hero-copy">
              {tour.subtitle.trim() && <p className="kicker">{tour.subtitle}</p>}
              <h1 className="tour-title" id="tour-title">{tour.title}</h1>
              {stops.length > 0 && <p className="tour-route-line">{stops.join(" · ")}</p>}
              <div className="tour-cta">
                <a className="btn btn--dark" href="#booking">{sessions.some((s) => s.free > 0) ? "Выбрать дату" : "Узнать о датах"} <IconArrow /></a>
                <p className="tour-price">{price.price}{price.note && <small>{price.note}</small>}</p>
              </div>
              {facts.length > 0 && <Facts items={facts} />}
            </div>
            <div className="tour-media">
              <TourCover src={tour.coverUrl} alt={tour.title} seed={tour.slug} variant={variants[tour.slug]} sizes="(max-width: 900px) 100vw, 600px" preload />
            </div>
          </div>
        </section>

        <div className="wrap tour-layout">
          <div className="tour-content">
            {tour.description.trim() && (
              <section className="tour-block" aria-labelledby="t-what">
                <h2 id="t-what">Что будет на экскурсии</h2>
                <Markdown className="md tour-desc">{tour.description}</Markdown>
              </section>
            )}
            {stops.length > 1 && (
              <section className="tour-block" aria-labelledby="t-route">
                <h2 id="t-route">Маршрут</h2>
                <ol className="stops">{stops.map((s) => <li key={s}>{s[0].toUpperCase() + s.slice(1)}</li>)}</ol>
              </section>
            )}
            {(meetingPoint || bring) && (
              <section className="tour-block info-cards" aria-label="Перед экскурсией">
                {meetingPoint && (
                  <div className="info-card"><IconPin /><h3>Место встречи</h3><p>{meetingPoint}</p></div>
                )}
                {bring && (
                  <div className="info-card"><IconBag /><h3>Что взять с собой</h3><p>{bring}</p></div>
                )}
              </section>
            )}
            <section className="tour-block" aria-labelledby="t-notes">
              <h2 id="t-notes">Важно знать</h2>
              <ul className="notes">
                {tour.note.trim() && <li><IconInfo /><span><b>Обратите внимание</b>{tour.note}</span></li>}
                <li><IconTicket /><span><b>Билет на почту</b>Билет и кассовый чек придут на почту сразу после оплаты; на месте гид встречает группу по списку участников.</span></li>
                <li><IconReturn /><span><b>Отмена и перенос</b>{CANCEL_TERMS}</span></li>
              </ul>
            </section>
          </div>
          <aside className="tour-aside" aria-label="Покупка билетов">
            <BookingPanel tour={tour} sessions={sessions} fallback={<SoldOut hasDates={sessions.length > 0} />} />
          </aside>
        </div>

        {related.length > 0 && (
          <section className="tour-more" aria-labelledby="more-title">
            <div className="wrap">
              <SectionHead
                kicker="Ещё маршруты"
                id="more-title"
                align="start"
                title={<>Другие <em>экскурсии</em></>}
                action={<Link className="link-more" href="/#catalog">Весь каталог <span aria-hidden="true">→</span></Link>}
              />
              <RelatedTours items={related} variants={variants} numbers={numbers} />
            </div>
          </section>
        )}
      </BookingProvider>
    </SiteShell>
  );
}
