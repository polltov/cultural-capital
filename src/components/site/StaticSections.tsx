import Link from "next/link";
import { Markdown } from "@/components/Markdown";
import { ogrnLabel, operator } from "@/lib/legal";

export function Hero() {
  return (
    <div className="hero">
      <div>
        <div className="eyebrow">Санкт-Петербург · экскурсии для семьи</div>
        <div className="h-title">Петербург, <em>вдохновляющий</em><br />с первого шага</div>
        <div className="h-sub">Авторские маршруты для детей и взрослых. Историки и искусствоведы, которые умеют говорить с детьми на одном языке.</div>
        <div className="h-actions">
          <a className="btn-primary" href="#catalog">Выбрать экскурсию →</a>
          <a className="btn-ghost" href="#catalog">Смотреть все</a>
        </div>
      </div>
      <div className="h-visual">
        <div className="h-photo"></div>
        <div className="h-photo-2"></div>
      </div>
    </div>
  );
}

export function Why() {
  return (
    <section className="why" id="about">
      <div className="why-intro">
        <h2 className="why-title">Почему с&nbsp;нами интересно</h2>
        <p className="why-lead">Мы водим небольшие группы и строим каждую прогулку как историю, в которой ребёнок — участник, а не слушатель.</p>
      </div>
      <ul className="why-list">
        <li className="why-row">
          <svg viewBox="0 0 48 48"><circle cx="16" cy="18" r="5"/><circle cx="32" cy="18" r="5"/><circle cx="24" cy="14" r="4"/><path d="M8 38 C8 31 11 27 16 27 M40 38 C40 31 37 27 32 27 M16 40 C16 32 20 28 24 28 C28 28 32 32 32 40"/></svg>
          <h3>Группы до 8 человек</h3>
          <p>Гид слышит каждого ребёнка, и никто не теряется в толпе.</p>
        </li>
        <li className="why-row">
          <svg viewBox="0 0 48 48"><path d="M24 12 C20 9 12 9 8 11 V36 C12 34 20 34 24 37 C28 34 36 34 40 36 V11 C36 9 28 9 24 12 Z M24 12 V37"/></svg>
          <h3>История через игру</h3>
          <p>Загадки, задания и находки по ходу маршрута: дети узнают, а не заучивают.</p>
        </li>
        <li className="why-row">
          <svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="15"/><path d="M24 24 L30 16 L26 26 L18 32 Z"/><path d="M24 9 V12 M24 36 V39 M9 24 H12 M36 24 H39"/></svg>
          <h3>Авторские маршруты</h3>
          <p>Каждая прогулка строится вокруг сюжета, а не списка дат и фамилий.</p>
        </li>
        <li className="why-row">
          <svg viewBox="0 0 48 48"><path d="M12 22 H34 V30 C34 35 30 38 23 38 C16 38 12 35 12 30 Z M34 24 C39 24 41 27 41 30 C41 33 39 35 34 35 M18 14 C16 16 18 18 17 20 M24 12 C22 14 24 16 23 18 M30 14 C28 16 30 18 29 20"/></svg>
          <h3>Спокойный темп</h3>
          <p>Идём в темпе самого младшего участника, с паузами и без спешки.</p>
        </li>
        <li className="why-row">
          <svg viewBox="0 0 48 48"><path d="M8 40 H40 M12 40 V20 M20 40 V20 M28 40 V20 M36 40 V20 M9 20 H39 M9 16 H39 M14 16 L24 8 L34 16"/></svg>
          <h3>Гиды — историки и педагоги</h3>
          <p>Знают Петербург в деталях и умеют говорить о нём с детьми.</p>
        </li>
      </ul>
    </section>
  );
}

export function Route() {
  return (
    <section className="route" aria-labelledby="route-title">
      <h2 className="route-title" id="route-title">Как проходит экскурсия</h2>
      <p className="route-lead">От брони до фотографий — шесть простых шагов.</p>
      <ol className="route-steps">
        <li className="route-step">
          <span className="route-num">1</span>
          <h3>Выбираете экскурсию</h3>
          <p>Находите дату в каталоге и бронируете места.</p>
        </li>
        <li className="route-step">
          <span className="route-num">2</span>
          <h3>Получаете письмо</h3>
          <p>Присылаем точку встречи, время и что взять с собой.</p>
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
    </section>
  );
}

export function Faq({ items }: { items: { id: number; question: string; answer: string }[] }) {
  if (items.length === 0) return null;
  return (
    <div className="faq" id="faq">
      <div className="faq-head">
        <div className="kicker">Часто спрашивают</div>
        <div className="stitle">Ответы на <em>популярные вопросы</em></div>
      </div>
      <div className="faq-list">
        {items.map((q) => (
          <details className="faq-item" key={q.id}>
            <summary>{q.question}<span className="plus">+</span></summary>
            <div className="answer"><Markdown>{q.answer}</Markdown></div>
          </details>
        ))}
      </div>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="foot">
      <div className="foot-row">
        <div>
          <Link className="logo" href="/#top"><span className="logo-blob"></span><span className="logo-txt">Культурная Столица</span></Link>
          <p className="foot-tag">Экскурсии по Петербургу для детей и взрослых: маленькие группы, авторские маршруты, история через игру.</p>
        </div>
        <nav className="foot-nav" aria-label="Разделы">
          <Link href="/#catalog">Экскурсии</Link><Link href="/#about">О нас</Link><Link href="/#reviews">Отзывы</Link><Link href="/news">Новости</Link><Link href="/#faq">Вопросы</Link>
        </nav>
      </div>
      <div className="foot-legal">
        <div>
          © 2026 Культурная Столица · Санкт-Петербург
          {operator.name && <><br />{operator.name}</>}
          {(operator.inn || operator.ogrn) && (
            <><br />{[operator.inn && `ИНН ${operator.inn}`, operator.ogrn && `${ogrnLabel(operator.name)} ${operator.ogrn}`].filter(Boolean).join(" · ")}</>
          )}
        </div>
        <nav aria-label="Документы">
          <Link href="/privacy">Политика обработки персональных данных</Link>
          <Link href="/consent">Согласие на обработку данных</Link>
        </nav>
      </div>
    </footer>
  );
}
