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

export function Guides() {
  return (
    <div className="guides-sec" id="guides">
      <div className="guides-head">
        <div className="kicker">кто ведёт экскурсии</div>
        <div className="stitle">Наши <em>экскурсоводы</em></div>
        <div className="sdesc">Историки, искусствоведы и педагоги. Каждый — специалист в своей эпохе и умеет рассказывать так, чтобы слушали и взрослые, и дети.</div>
      </div>
      <div className="guides-grid">

        <article className="guide">
          <div className="guide-photo">
            <span className="guide-tag">Историк</span>
          </div>
          <div className="guide-body">
            <div className="guide-name">Павел</div>
            <div className="guide-role">Опыт 5 лет</div>
            <div className="guide-quote">Мне всегда была интересна сфера науки и преподавания, но особое место для меня занимают экскурсии, которые позволяют по-настоящему влюбиться в город, получить искренние эмоции и незабываемые впечатления.</div>
          </div>
        </article>

        <article className="guide">
          <div className="guide-photo">
            <span className="guide-tag">Педагог-историк</span>
          </div>
          <div className="guide-body">
            <div className="guide-name">Светлана</div>
            <div className="guide-role">Опыт 7 лет</div>
            <div className="guide-quote">Интерес к истории расширяет познание мира и делает Вас и вашего ребёнка разносторонней личностью.</div>
          </div>
        </article>

        <article className="guide">
          <div className="guide-photo">
            <span className="guide-tag">Педагог-историк</span>
          </div>
          <div className="guide-body">
            <div className="guide-name">Дарья</div>
            <div className="guide-role">Опыт 9 лет</div>
            <div className="guide-quote">Во время прогулки я не только делюсь увлекательными историями, но и предлагаю детям выполнить тематические задания. Информация усваивается легче, а знакомство с Петербургом превращается в настоящее приключение!</div>
          </div>
        </article>

      </div>
    </div>
  );
}

export function Faq() {
  return (
    <div className="faq" id="faq">
      <div className="faq-head">
        <div className="kicker">Часто спрашивают</div>
        <div className="stitle">Ответы на <em>популярные вопросы</em></div>
      </div>
      <div className="faq-list">

        <details className="faq-item">
          <summary>С какого возраста подходят экскурсии?<span className="plus">+</span></summary>
          <div className="answer">У нас есть маршруты для детей от 5 лет, для школьников и для подростков. Формат подачи и продолжительность подбираем под возраст группы — так, чтобы было интересно и не утомительно.</div>
        </details>

        <details className="faq-item">
          <summary>Сколько длится экскурсия?<span className="plus">+</span></summary>
          <div className="answer">Стандартная прогулка — 1,5–2 часа. Музейные маршруты — от 1 часа. Точное время указано в карточке каждой экскурсии; если нужен более длинный или короткий формат — договоримся индивидуально.</div>
        </details>

        <details className="faq-item">
          <summary>Что делать, если плохая погода?<span className="plus">+</span></summary>
          <div className="answer">Дождь или снег — не повод отменять. У нас есть «погодные» варианты: перенос на музейный маршрут или на другой день без потери оплаты. Решаем гибко за пару часов до начала.</div>
        </details>

        <details className="faq-item">
          <summary>Проводите индивидуальные экскурсии?<span className="plus">+</span></summary>
          <div className="answer">Да. Любая экскурсия из каталога может пройти в формате «только ваша семья»: выбираете удобное время, темп и акценты. Стоимость и детали — по запросу через форму или в личном сообщении.</div>
        </details>

        <details className="faq-item">
          <summary>Как оплатить и можно ли отменить бронь?<span className="plus">+</span></summary>
          <div className="answer">После заявки мы согласуем детали и присылаем ссылку на оплату. Отменить или перенести бронь без потерь можно за 24 часа до начала. При отмене позже — возврат 50%.</div>
        </details>

        <details className="faq-item">
          <summary>Есть ли скидки для больших семей?<span className="plus">+</span></summary>
          <div className="answer">Да, при бронировании от 4 человек — семейный тариф. Для двух и более экскурсий в один визит — «маршрут выходного дня» со скидкой 10%. Пишите — подберём вариант.</div>
        </details>

      </div>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="foot">
      <div className="foot-row">
        <div>
          <a className="logo" href="#top"><span className="logo-blob"></span><span className="logo-txt">Культурная Столица</span></a>
          <p className="foot-tag">Экскурсии по Петербургу для детей и взрослых: маленькие группы, авторские маршруты, история через игру.</p>
        </div>
        <nav className="foot-nav" aria-label="Разделы">
          <a href="#catalog">Экскурсии</a><a href="#guides">Гиды</a><a href="#about">О нас</a><a href="#reviews">Отзывы</a><a href="#faq">Вопросы</a>
        </nav>
      </div>
      <div className="foot-bottom">© 2026 Культурная Столица · Санкт-Петербург</div>
    </footer>
  );
}
