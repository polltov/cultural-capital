import Image from "next/image";
import Link from "next/link";
import { Markdown } from "@/components/Markdown";
import { ogrnLabel, operator } from "@/lib/legal";
import { contactLinks, externalProps, requestTourContact, REQUEST_TOUR_LABEL, type ContactLink } from "@/lib/contacts";
import { formatDayMonth, formatTime, formatWeekday } from "@/lib/domain/moscow-time";
import { pluralRu, seatsBadge } from "@/lib/domain/seats";
import { defaultSiteContent, type SiteContent } from "@/lib/site-content";
import type { ScheduleItem } from "@/lib/domain/schedule";
import type { CatalogTour } from "@/server/catalog";
import { Emphasis } from "./Emphasis";
import { BuyButton } from "./Booking";
import { Logo, NAV } from "./Logo";
import { IconArrow, IconCompass, IconGroup, IconTicket } from "./icons";
import { NAV_FORWARD } from "./transitions";

/** Ссылка «к содержимому» для клавиатуры и скринридеров — первая на странице. */
export function SkipLink() {
  return <a className="skip" href="#main">К содержимому</a>;
}

type Next = ScheduleItem<CatalogTour["tour"]> | null;

/** Первый экран: обещание, два пути (выбрать экскурсию / ближайшие даты) и подсказка с ближайшим сеансом. */
export function Hero({ next, content, requestHref }: { next: Next; content: SiteContent["hero"]; requestHref?: string }) {
  const showTicket = next !== null || content.ticket !== defaultSiteContent.hero.ticket;
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="wrap hero-grid">
        <div className="hero-copy">
          <p className="eyebrow">{content.eyebrow}</p>
          <h1 className="hero-title" id="hero-title"><Emphasis text={content.title} nowrapTail={content.title === defaultSiteContent.hero.title} /></h1>
          <p className="hero-sub">{content.description}</p>
          <div className="hero-actions">
            {requestHref ? (
              <>
                <a className="btn btn--dark" href={requestHref} {...externalProps(requestHref)}>{REQUEST_TOUR_LABEL} <IconArrow /></a>
                <Link className="btn btn--ghost" href="/#catalog">{content.catalogLabel}</Link>
              </>
            ) : (
              <>
                <Link className="btn btn--dark" href="/#catalog">{content.catalogLabel} <IconArrow /></Link>
                <Link className="btn btn--ghost" href="/#afisha">{content.datesLabel}</Link>
              </>
            )}
          </div>
          <ul className="hero-facts">
            <li><IconGroup />{content.group}</li>
            <li><IconCompass />{content.route}</li>
            {showTicket && <li><IconTicket />{content.ticket}</li>}
          </ul>
        </div>
        <div className="hero-visual">
          <figure className="hero-photo hero-photo--main">
            <Image src={content.mainPhoto.url} alt={content.mainPhoto.alt} fill preload sizes="(max-width: 760px) 78vw, (max-width: 899px) 420px, (max-width: 1100px) 36vw, 440px" />
            {content.mainPhoto.caption && <figcaption>{content.mainPhoto.caption}</figcaption>}
          </figure>
          <figure className="hero-photo hero-photo--side">
            <Image src={content.sidePhoto.url} alt={content.sidePhoto.alt} fill sizes="(max-width: 760px) 50vw, (max-width: 899px) 260px, (max-width: 1100px) 22vw, 280px" />
            {content.sidePhoto.caption && <figcaption>{content.sidePhoto.caption}</figcaption>}
          </figure>
          {next && <NextStub item={next} />}
        </div>
      </div>
    </section>
  );
}

/** «Ближайшая экскурсия»: корешок билета поверх фото; вырезы перфорации — ровно на линии отрыва. */
function NextStub({ item: { tour, session } }: { item: NonNullable<Next> }) {
  return (
    <div className="stub">
      <div className="stub-main">
        <p className="stub-kicker">Ближайшая экскурсия</p>
        <p className="stub-date">{formatDayMonth(session.startsAt)}, {formatWeekday(session.startsAt)} · {formatTime(session.startsAt)}</p>
        <p className="stub-title"><Link href={`/tours/${tour.slug}`} transitionTypes={NAV_FORWARD}>{tour.title}</Link></p>
      </div>
      <div className="stub-foot">
        <span className="stub-seats">{seatsBadge(session.free) ?? `свободно ${session.free} ${pluralRu(session.free, ["место", "места", "мест"])}`}</span>
        <BuyButton tourId={tour.id} sessionId={session.id} className="stub-buy" label={`Купить билет: ${tour.title}, ${formatDayMonth(session.startsAt)}`}>
          Купить <IconArrow />
        </BuyButton>
      </div>
    </div>
  );
}

const WHY_ICONS: Record<string, React.ReactNode> = {
  "why-1": <svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="16" cy="18" r="5"/><circle cx="32" cy="18" r="5"/><circle cx="24" cy="14" r="4"/><path d="M8 38 C8 31 11 27 16 27 M40 38 C40 31 37 27 32 27 M16 40 C16 32 20 28 24 28 C28 28 32 32 32 40"/></svg>,
  "why-2": <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 12 C20 9 12 9 8 11 V36 C12 34 20 34 24 37 C28 34 36 34 40 36 V11 C36 9 28 9 24 12 Z M24 12 V37"/></svg>,
  "why-3": <svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="15"/><path d="M24 24 L30 16 L26 26 L18 32 Z"/><path d="M24 9 V12 M24 36 V39 M9 24 H12 M36 24 H39"/></svg>,
  "why-4": <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M12 22 H34 V30 C34 35 30 38 23 38 C16 38 12 35 12 30 Z M34 24 C39 24 41 27 41 30 C41 33 39 35 34 35 M18 14 C16 16 18 18 17 20 M24 12 C22 14 24 16 23 18 M30 14 C28 16 30 18 29 20"/></svg>,
  "why-5": <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 40 H40 M12 40 V20 M20 40 V20 M28 40 V20 M36 40 V20 M9 20 H39 M9 16 H39 M14 16 L24 8 L34 16"/></svg>,
};

export function Why({ content = defaultSiteContent.why }: { content?: SiteContent["why"] }) {
  if (content.items.length === 0) return null;
  return (
    <section className="why" id="about" aria-labelledby="about-title">
      <div className="wrap why-grid">
        <div className="why-intro">
          <p className="kicker">{content.kicker}</p>
          <h2 className="why-title" id="about-title"><Emphasis text={content.title} /></h2>
          <p className="why-lead">{content.lead}</p>
          <div className="why-art" aria-hidden="true" />
        </div>
        <ul className="why-list">
          {content.items.map((item) => (
            <li className="why-row" key={item.id}>
              {Object.hasOwn(WHY_ICONS, item.id) ? WHY_ICONS[item.id] : <IconCompass />}
              <h3>{item.title}</h3>
              {item.body && <p>{item.body}</p>}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Route({ content = defaultSiteContent.route, onlineBooking = true }: {
  content?: SiteContent["route"];
  onlineBooking?: boolean;
}) {
  if (content.items.length === 0) return null;

  const [purchase, ticket] = defaultSiteContent.route.items;
  const items = onlineBooking ? content.items : content.items.map((item) => {
    if (item.id === purchase.id && item.title === purchase.title && item.body === purchase.body) {
      return { ...item, title: "Запрашиваете экскурсию", body: "Свяжитесь с нами, чтобы подобрать маршрут и дату." };
    }
    if (item.id === ticket.id && item.title === ticket.title && item.body === ticket.body) {
      return { ...item, title: "Уточняем детали встречи", body: "Подскажем, где встретиться и что взять с собой." };
    }
    return item;
  });
  return (
    <section className="route" aria-labelledby="route-title">
      <div className="wrap">
        <p className="kicker kicker--light">{content.kicker}</p>
        <h2 className="route-title" id="route-title"><Emphasis text={content.title} /></h2>
        <p className="route-lead">{content.lead}</p>
        <ol className={items.length === 6 ? "route-steps" : "route-steps route-steps--custom"}>
          {items.map((item, i) => (
            <li className="route-step" key={item.id}>
              <span className="route-num">{i + 1}</span>
              <h3>{item.title}</h3>
              {item.body && <p>{item.body}</p>}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** Первые два канала связи показываются кнопками. */
export function ContactButtons({ contacts, max = 2, light = false, requestTour = false }: {
  contacts: ContactLink[];
  max?: number;
  light?: boolean;
  requestTour?: boolean;
}) {
  const request = requestTour ? requestTourContact(contacts) : undefined;
  const ordered = request ? [request, ...contacts.filter((contact) => contact !== request)] : contacts;
  const links = ordered.slice(0, max);
  if (links.length === 0) return null;
  return (
    <div className="contact-buttons">
      {links.map((c, i) => (
        <a key={c.kind} className={`btn ${i === 0 ? (light ? "btn--light" : "btn--dark") : light ? "btn--ghost-light" : "btn--ghost"}`} href={c.href} {...externalProps(c.href)}>
          {c === request ? REQUEST_TOUR_LABEL : c.kind === "phone" ? `Позвонить: ${c.value}` : c.kind === "email" ? "Написать на почту" : `Написать в ${c.label}`}
        </a>
      ))}
    </div>
  );
}

/** Индивидуальные экскурсии — только когда есть куда написать: без контактов блок ничего не даёт. */
export function PrivateTours({ content, contacts }: { content: SiteContent["privateTours"]; contacts: ContactLink[] }) {
  if (contacts.length === 0) return null;
  return (
    <section className="private" aria-labelledby="private-title">
      <div className="wrap">
        <div className="private-card">
          <div className="private-copy">
            <p className="kicker kicker--light">{content.kicker}</p>
            <h2 className="private-title" id="private-title"><Emphasis text={content.title} /></h2>
            <p>{content.paragraph1}</p>
            <p>{content.paragraph2}</p>
            <ContactButtons contacts={contacts} light />
          </div>
          <div className="private-art" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}

export function Faq({ items, contacts = contactLinks() }: {
  items: { id: number; question: string; answer: string }[];
  contacts?: ContactLink[];
}) {
  if (items.length === 0) return null;
  const hasContacts = contacts.length > 0;
  return (
    <section className="faq" id="faq" aria-labelledby="faq-title">
      <div className="wrap faq-grid">
        <div className="faq-head">
          <p className="kicker">Часто спрашивают</p>
          <h2 className="stitle" id="faq-title">Ответы на <em>популярные вопросы</em></h2>
          {hasContacts && (
            <>
              <p className="slead">Не нашли ответ? Напишите нам — подскажем и поможем выбрать маршрут.</p>
              <ContactButtons contacts={contacts} />
            </>
          )}
        </div>
        <div className="faq-list">
          {items.map((q) => (
            <details className="faq-item" key={q.id}>
              <summary>{q.question}<span className="plus" aria-hidden="true"></span></summary>
              <div className="answer"><Markdown>{q.answer}</Markdown></div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Footer({ description = defaultSiteContent.footer.description, contacts = contactLinks(), nav = NAV }: {
  description?: string;
  contacts?: ContactLink[];
  nav?: typeof NAV;
}) {
  const year = new Date().getFullYear();
  return (
    <footer className="foot">
      <div className="wrap">
        <div className="foot-top">
          <div className="foot-brand">
            <Logo light lazy className="logo logo--foot" />
            <p className="foot-tag">{description}</p>
          </div>
          <nav className="foot-col" aria-label="Разделы сайта">
            <p className="foot-h">Разделы</p>
            <ul>
              {nav.map((n) => <li key={n.href}><Link href={n.href}>{n.label}</Link></li>)}
              <li><Link href="/account">Мои билеты</Link></li>
            </ul>
          </nav>
          {contacts.length > 0 && (
            <div className="foot-col">
              <p className="foot-h">Связаться</p>
              <ul>{contacts.map((c) => <li key={c.kind}><a href={c.href} {...externalProps(c.href)}>{c.value}</a></li>)}</ul>
            </div>
          )}
          <nav className="foot-col" aria-label="Документы">
            <p className="foot-h">Документы</p>
            <ul>
              <li><Link href="/offer">Договор-оферта</Link></li>
              <li><Link href="/privacy">Политика обработки персональных данных</Link></li>
              <li><Link href="/consent">Согласие на обработку данных</Link></li>
            </ul>
          </nav>
        </div>
        <div className="foot-legal">
          <p>© {year} Культурная Столица · Санкт-Петербург</p>
          {(operator.name || operator.inn || operator.ogrn) && (
            <p>
              {[operator.name, operator.inn && `ИНН ${operator.inn}`, operator.ogrn && `${ogrnLabel(operator.name)} ${operator.ogrn}`].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
      </div>
    </footer>
  );
}
