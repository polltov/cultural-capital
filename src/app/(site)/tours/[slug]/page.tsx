import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Markdown } from "@/components/Markdown";
import { BookingProvider } from "@/components/site/Booking";
import { BookingPanel } from "@/components/site/BookingPanel";
import { TicketGrid } from "@/components/site/Catalog";
import { JsonLd } from "@/components/site/JsonLd";
import { SectionHead } from "@/components/site/SectionHead";
import { SiteShell } from "@/components/site/SiteShell";
import { ContactButtons } from "@/components/site/StaticSections";
import { TourCover } from "@/components/site/TourCover";
import { BACK_TO_CATALOG, NAV_BACK, TourCoverTransition } from "@/components/site/transitions";
import { IconAge, IconArrow, IconBag, IconClock, IconGroup, IconInfo, IconPin, IconReturn, IconTicket } from "@/components/site/icons";
import { contactLinks } from "@/lib/contacts";
import { CANCEL_TERMS } from "@/lib/domain/refund-policy";
import { coverVariants, headlinePrice, routeStops, tourMetaDescription } from "@/lib/domain/tour-text";
import { breadcrumbLd, tourLd } from "@/lib/seo";
import { findTour, getPublishedCatalog } from "@/server/catalog";

// Как и главная: даты и свободные места обновляются раз в 5 минут, а после покупок и правок в админке — сразу.
export const revalidate = 300;
// Страницы опубликованных экскурсий собираются при сборке: первый посетитель не ждёт, а если база ненадолго недоступна,
// страница отдаётся из кэша. Новая экскурсия из админки строится по первому запросу и дальше тоже кэшируется (ISR).
export async function generateStaticParams(): Promise<{ slug: string }[]> {
  try {
    return (await getPublishedCatalog()).map((c) => ({ slug: c.tour.slug }));
  } catch {
    // сборка без доступа к базе: страницы просто построятся по первому запросу
    return [];
  }
}

/** Длиннее этого место встречи в строку фактов не помещается. */
const START_FACT_MAX = 40;
/** Значение длиннее этого занимает всю строку фактов, а не одну из двух колонок: иначе на телефоне слова рвутся посередине. */
const WIDE_FACT = 22;
/** Названия длиннее этого набираются кеглем поменьше, чтобы не занимать весь первый экран. */
const LONG_TITLE = 36;

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
        <li key={f.label} className={f.value.length > WIDE_FACT ? "is-wide" : undefined}>{f.icon}<span>{f.label}</span><b>{f.value}</b></li>
      ))}
    </ul>
  );
}

/** Вместо кнопки покупки, когда купить нечего: что случилось, куда пойти дальше и (если есть контакты) кому написать. */
function SoldOut({ hasDates }: { hasDates: boolean }) {
  const hasContacts = contactLinks().length > 0;
  return (
    <div className="booking-empty">
      <p>{hasDates ? "На эти даты все места разобраны — новые появятся в афише." : "Даты этой экскурсии скоро появятся в афише."}</p>
      <Link className="btn btn--ghost btn--block" href="/afisha">Смотреть афишу</Link>
      {hasContacts && (
        <>
          <p>Или напишите нам — сообщим о новых датах или проведём экскурсию для вашей семьи.</p>
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
  // В браузер уходит только то, что нужно окну покупки и карточкам: без описаний и служебных полей остальных экскурсий.
  const bookable = catalog.map((c) => ({
    tour: { id: c.tour.id, title: c.tour.title, priceChild: c.tour.priceChild, priceAdult: c.tour.priceAdult },
    sessions: c.sessions,
  }));
  const related = catalog
    .filter((c) => c.tour.id !== tour.id)
    .slice(0, 3)
    .map((c) => ({ tour: { ...c.tour, description: "", note: "", meetingPoint: "", whatToBring: "" }, sessions: c.sessions }));
  const stops = routeStops(tour.route);
  const meetingPoint = tour.meetingPoint.trim();
  const bring = tour.whatToBring.trim();
  const groupSize = sessions.length > 0 ? Math.max(...sessions.map((s) => s.capacity)) : null;
  const price = headlinePrice(tour);
  const canBuy = sessions.some((s) => s.free > 0);

  const facts = [
    tour.durationLabel.trim() && { icon: <IconClock />, label: "Длительность", value: tour.durationLabel.trim() },
    tour.ageLabel.trim() && { icon: <IconAge />, label: "Возраст", value: tour.ageLabel.trim() },
    groupSize && { icon: <IconGroup />, label: "Группа", value: `до ${groupSize} человек` },
    // короткое место встречи — прямо в фактах; длинное (с пояснениями) показываем только карточкой «Место встречи» ниже
    meetingPoint && meetingPoint.length <= START_FACT_MAX && { icon: <IconPin />, label: "Старт", value: meetingPoint },
  ].filter((f): f is { icon: React.ReactElement; label: string; value: string } => Boolean(f));

  return (
    // кнопка в шапке ведёт к датам этой экскурсии, а если купить здесь нечего — в общую афишу (по умолчанию)
    <SiteShell cta={canBuy ? { href: "#booking", label: "Купить билет" } : undefined}>
      <JsonLd data={[...tourLd(tour, sessions), breadcrumbLd([{ name: "Главная", path: "/" }, { name: "Экскурсии", path: "/#catalog" }, { name: tour.title, path: `/tours/${tour.slug}` }])]} />
      <BookingProvider catalog={bookable}>
        <div className="wrap">
          <nav className="crumbs" aria-label="Навигационная цепочка">
            <ol>
              <li><Link href="/" transitionTypes={NAV_BACK}>Главная</Link></li>
              <li><Link href="/#catalog" transitionTypes={BACK_TO_CATALOG}>Экскурсии</Link></li>
              <li aria-current="page">{tour.title}</li>
            </ol>
          </nav>
        </div>

        <section className="tour-hero" aria-labelledby="tour-title">
          <div className="wrap tour-hero-grid">
            <div className="tour-hero-copy">
              {tour.subtitle.trim() && <p className="kicker">{tour.subtitle}</p>}
              <h1 className={tour.title.length > LONG_TITLE ? "tour-title tour-title--long" : "tour-title"} id="tour-title">{tour.title}</h1>
              {stops.length > 0 && <p className="tour-route-line">{stops.join(" · ")}</p>}
              <div className="tour-cta">
                {canBuy ? (
                  <a className="btn btn--dark" href="#booking">Выбрать дату <IconArrow /></a>
                ) : (
                  <Link className="btn btn--dark" href="/afisha">Смотреть афишу <IconArrow /></Link>
                )}
                <p className="tour-price">{price.price}{price.note && <small>{price.note}</small>}</p>
              </div>
              {facts.length > 0 && <Facts items={facts} />}
            </div>
            {/* та же обложка, что у карточки в каталоге: при переходе из каталога она перетекает сюда (transitions.tsx) */}
            <TourCoverTransition slug={tour.slug}>
              <div className="tour-media">
                <TourCover src={tour.coverUrl} alt={tour.title} seed={tour.slug} variant={variants[tour.slug]} sizes="(max-width: 900px) 100vw, 600px" preload />
              </div>
            </TourCoverTransition>
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
            <BookingPanel tour={{ id: tour.id, title: tour.title, priceChild: tour.priceChild, priceAdult: tour.priceAdult }} sessions={sessions} fallback={<SoldOut hasDates={sessions.length > 0} />} />
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
                action={<Link className="link-more" href="/#catalog" transitionTypes={BACK_TO_CATALOG}>Весь каталог <span aria-hidden="true">→</span></Link>}
              />
              <TicketGrid items={related} variants={variants} numbers={numbers} flat />
            </div>
          </section>
        )}
      </BookingProvider>
    </SiteShell>
  );
}
