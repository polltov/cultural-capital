import Image from "next/image";
import Link from "next/link";
import { Markdown } from "@/components/Markdown";
import { ogrnLabel, operator } from "@/lib/legal";
import { contactLinks, externalProps } from "@/lib/contacts";
import { formatDayMonth, formatTime, formatWeekday } from "@/lib/domain/moscow-time";
import { pluralRu, seatsBadge } from "@/lib/domain/seats";
import type { ScheduleItem } from "@/lib/domain/schedule";
import type { CatalogTour } from "@/server/catalog";
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
export function Hero({ next }: { next: Next }) {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="wrap hero-grid">
        <div className="hero-copy">
          <p className="eyebrow">Санкт-Петербург · экскурсии для семьи</p>
          <h1 className="hero-title" id="hero-title">Петербург, <em>вдохновляющий</em> <span className="nowrap">с первого шага</span></h1>
          <p className="hero-sub">Авторские маршруты для детей и взрослых. Историки и искусствоведы, которые умеют говорить с детьми на одном языке.</p>
          <div className="hero-actions">
            <Link className="btn btn--dark" href="/#catalog">Выбрать экскурсию <IconArrow /></Link>
            <Link className="btn btn--ghost" href="/#afisha">Ближайшие даты</Link>
          </div>
          <ul className="hero-facts">
            <li><IconGroup />Группы до 8 человек</li>
            <li><IconCompass />Сюжет и задания на маршруте</li>
            <li><IconTicket />Билет — сразу на почту</li>
          </ul>
        </div>
        <div className="hero-visual">
          <figure className="hero-photo hero-photo--main">
            <Image src="/assets/dvortsovaya.jpg" alt="Дворцовая площадь и Александровская колонна на закате" fill preload sizes="(max-width: 760px) 78vw, (max-width: 899px) 420px, (max-width: 1100px) 36vw, 440px" />
            <figcaption>Дворцовая площадь</figcaption>
          </figure>
          <figure className="hero-photo hero-photo--side">
            <Image src="/assets/spas.jpg" alt="Спас на Крови с высоты" fill sizes="(max-width: 760px) 50vw, (max-width: 899px) 260px, (max-width: 1100px) 22vw, 280px" />
            <figcaption>Спас на Крови</figcaption>
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

export function Why() {
  return (
    <section className="why" id="about" aria-labelledby="about-title">
      <div className="wrap why-grid">
        <div className="why-intro">
          <p className="kicker">О нас</p>
          <h2 className="why-title" id="about-title">Почему с&nbsp;нами <em>интересно</em></h2>
          <p className="why-lead">Мы водим небольшие группы и строим каждую прогулку как историю, в которой ребёнок — участник, а не слушатель.</p>
          <div className="why-art" aria-hidden="true" />
        </div>
        <ul className="why-list">
          <li className="why-row">
            <svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="16" cy="18" r="5"/><circle cx="32" cy="18" r="5"/><circle cx="24" cy="14" r="4"/><path d="M8 38 C8 31 11 27 16 27 M40 38 C40 31 37 27 32 27 M16 40 C16 32 20 28 24 28 C28 28 32 32 32 40"/></svg>
            <h3>Группы до 8 человек</h3>
            <p>Гид слышит каждого ребёнка, и никто не теряется в толпе.</p>
          </li>
          <li className="why-row">
            <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 12 C20 9 12 9 8 11 V36 C12 34 20 34 24 37 C28 34 36 34 40 36 V11 C36 9 28 9 24 12 Z M24 12 V37"/></svg>
            <h3>История через игру</h3>
            <p>Загадки, задания и находки по ходу маршрута: дети узнают, а не заучивают.</p>
          </li>
          <li className="why-row">
            <svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="15"/><path d="M24 24 L30 16 L26 26 L18 32 Z"/><path d="M24 9 V12 M24 36 V39 M9 24 H12 M36 24 H39"/></svg>
            <h3>Авторские маршруты</h3>
            <p>Каждая прогулка строится вокруг сюжета, а не списка дат и фамилий.</p>
          </li>
          <li className="why-row">
            <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M12 22 H34 V30 C34 35 30 38 23 38 C16 38 12 35 12 30 Z M34 24 C39 24 41 27 41 30 C41 33 39 35 34 35 M18 14 C16 16 18 18 17 20 M24 12 C22 14 24 16 23 18 M30 14 C28 16 30 18 29 20"/></svg>
            <h3>Спокойный темп</h3>
            <p>Идём в темпе самого младшего участника, с паузами и без спешки.</p>
          </li>
          <li className="why-row">
            <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 40 H40 M12 40 V20 M20 40 V20 M28 40 V20 M36 40 V20 M9 20 H39 M9 16 H39 M14 16 L24 8 L34 16"/></svg>
            <h3>Гиды — историки и педагоги</h3>
            <p>Знают Петербург в деталях и умеют говорить о нём с детьми.</p>
          </li>
        </ul>
      </div>
    </section>
  );
}

export function Route() {
  return (
    <section className="route" aria-labelledby="route-title">
      <div className="wrap">
        <p className="kicker kicker--light">Шаг за шагом</p>
        <h2 className="route-title" id="route-title">Как проходит экскурсия</h2>
        <p className="route-lead">От брони до фотографий — шесть простых шагов.</p>
        <ol className="route-steps">
          <li className="route-step">
            <span className="route-num">1</span>
            <h3>Покупаете билет онлайн</h3>
            <p>Выбираете дату и оплачиваете картой или по СБП.</p>
          </li>
          <li className="route-step">
            <span className="route-num">2</span>
            <h3>Получаете билет на почту</h3>
            <p>С точкой встречи, временем и списком, что взять с собой.</p>
          </li>
          <li className="route-step">
            <span className="route-num">3</span>
            <h3>Приходите к старту</h3>
            <p>Гид встречает группу на месте начала маршрута.</p>
          </li>
          <li className="route-step">
            <span className="route-num">4</span>
            <h3>Гуляете и играете</h3>
            <p>Истории, задания и остановки в самых интересных местах.</p>
          </li>
          <li className="route-step">
            <span className="route-num">5</span>
            <h3>Получаете фото</h3>
            <p>После прогулки отправляем снимки с экскурсии.</p>
          </li>
          <li className="route-step">
            <span className="route-num">6</span>
            <h3>Возвращаетесь снова</h3>
            <p>Новый маршрут — новая история Петербурга.</p>
          </li>
        </ol>
      </div>
    </section>
  );
}

/** Ссылки «написать» из contacts.ts: первые две — кнопками; пусто — ничего. */
export function ContactButtons({ max = 2, light = false }: { max?: number; light?: boolean }) {
  const links = contactLinks().slice(0, max);
  if (links.length === 0) return null;
  return (
    <div className="contact-buttons">
      {links.map((c, i) => (
        <a key={c.kind} className={`btn ${i === 0 ? (light ? "btn--light" : "btn--dark") : light ? "btn--ghost-light" : "btn--ghost"}`} href={c.href} {...externalProps(c.href)}>
          {c.kind === "phone" ? `Позвонить: ${c.value}` : c.kind === "email" ? "Написать на почту" : `Написать в ${c.label}`}
        </a>
      ))}
    </div>
  );
}

/** Индивидуальные экскурсии — только когда есть куда написать: без контактов блок ничего не даёт. */
export function PrivateTours() {
  if (contactLinks().length === 0) return null;
  return (
    <section className="private" aria-labelledby="private-title">
      <div className="wrap">
        <div className="private-card">
          <div className="private-copy">
            <p className="kicker kicker--light">Индивидуально</p>
            <h2 className="private-title" id="private-title">Экскурсия только для <em>вашей семьи</em></h2>
            <p>Любая экскурсия из каталога может пройти в формате «только ваша семья»: выбираете удобное время, темп и акценты.</p>
            <p>Для семей от 4 человек и для двух экскурсий в один визит есть специальные условия — напишите нам, подберём вариант.</p>
            <ContactButtons light />
          </div>
          <div className="private-art" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}

export function Faq({ items }: { items: { id: number; question: string; answer: string }[] }) {
  if (items.length === 0) return null;
  const hasContacts = contactLinks().length > 0;
  return (
    <section className="faq" id="faq" aria-labelledby="faq-title">
      <div className="wrap faq-grid">
        <div className="faq-head">
          <p className="kicker">Часто спрашивают</p>
          <h2 className="stitle" id="faq-title">Ответы на <em>популярные вопросы</em></h2>
          {hasContacts && (
            <>
              <p className="slead">Не нашли ответ? Напишите нам — подскажем и поможем выбрать маршрут.</p>
              <ContactButtons />
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

export function Footer() {
  const contacts = contactLinks();
  const year = new Date().getFullYear();
  return (
    <footer className="foot">
      <div className="wrap">
        <div className="foot-top">
          <div className="foot-brand">
            <Logo light lazy className="logo logo--foot" />
            <p className="foot-tag">Экскурсии по Петербургу для детей и взрослых: маленькие группы, авторские маршруты, история через игру.</p>
          </div>
          <nav className="foot-col" aria-label="Разделы сайта">
            <p className="foot-h">Разделы</p>
            <ul>{NAV.map((n) => <li key={n.href}><Link href={n.href}>{n.label}</Link></li>)}</ul>
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
