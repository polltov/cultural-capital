"use client";

import { useEffect, useRef, useState } from "react";
import { IconArrow, IconStar } from "./icons";

const REVIEWS = [
  { quote: "Дочь теперь ищет львов по всему Петербургу. Экскурсия была не про даты и цифры, а про историю, которую она проживала.", name: "Ольга", about: "мама двоих детей" },
  { quote: "Сын-подросток обычно скучает на любых экскурсиях. Здесь два часа пролетели, а вечером он ещё гуглил про сфинксов и атлантов.", name: "Игорь", about: "отец 13-летнего сына" },
  { quote: "Приехали из Москвы на выходные. Гид сразу нашла общий язык и с 5-летним, и со мной. Уехали влюблённые в Петербург заново.", name: "Марина", about: "Москва" },
  { quote: "Не ожидала, что вечерняя прогулка по мостам может быть настолько атмосферной. Не туристический пересказ Википедии, а живой рассказ.", name: "Елена", about: "гостья из Калининграда" },
];

/** Отзывы лентой: на компьютере видно три, на телефоне листаются пальцем; стрелки сдвигают на один отзыв. */
export function ReviewsCarousel() {
  const track = useRef<HTMLUListElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });

  const update = () => {
    const el = track.current;
    if (!el) return;
    setEdge({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  };
  useEffect(() => {
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const step = (dir: 1 | -1) => {
    const el = track.current;
    const card = el?.querySelector("li");
    if (!el || !card) return;
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
    el.scrollBy({ left: dir * (card.getBoundingClientRect().width + gap), behavior: "smooth" });
  };

  return (
    <section className="reviews" id="reviews" aria-labelledby="reviews-title">
      <div className="wrap">
        <div className="shead shead--start">
          <div className="shead-text">
            <p className="kicker">Что говорят</p>
            <h2 className="stitle" id="reviews-title">Отзывы <em>наших гостей</em></h2>
          </div>
          <div className="reviews-nav">
            <button type="button" className="rev-arrow rev-arrow--prev" aria-label="Предыдущий отзыв" disabled={edge.start} onClick={() => step(-1)}><IconArrow /></button>
            <button type="button" className="rev-arrow" aria-label="Следующий отзыв" disabled={edge.end} onClick={() => step(1)}><IconArrow /></button>
          </div>
        </div>
        {/* лента прокручивается — с клавиатуры тоже: фокус на ней и стрелки ← → */}
        <ul className="reviews-track" ref={track} onScroll={update} aria-label="Отзывы" tabIndex={0}>
          {REVIEWS.map((r) => (
            <li className="review" key={r.name}>
              <figure>
                <p className="stars" role="img" aria-label="Оценка 5 из 5">{[0, 1, 2, 3, 4].map((i) => <IconStar key={i} />)}</p>
                <blockquote className="quote">{r.quote}</blockquote>
                <figcaption className="who"><b>{r.name}</b>{r.about}</figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
