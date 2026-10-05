"use client";

import { useRef, useState } from "react";

const REVIEWS = [
  { quote: "Дочь теперь ищет львов по всему Петербургу. Экскурсия была не про даты и цифры, а про историю, которую она проживала.", name: "Ольга", about: "мама двоих детей" },
  { quote: "Сын-подросток обычно скучает на любых экскурсиях. Здесь два часа пролетели, а вечером он ещё гуглил про сфинксов и атлантов.", name: "Игорь", about: "отец 13-летнего сына" },
  { quote: "Приехали из Москвы на выходные. Гид сразу нашла общий язык и с 5-летним, и со мной. Уехали влюблённые в Петербург заново.", name: "Марина", about: "Москва" },
  { quote: "Не ожидала, что вечерняя прогулка по мостам может быть настолько атмосферной. Не туристический пересказ Википедии, а живой рассказ.", name: "Елена", about: "гостья из Калининграда" },
];

export function ReviewsCarousel() {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const count = REVIEWS.length;

  const current = () => {
    const el = track.current!;
    return Math.round(el.scrollLeft / el.clientWidth);
  };
  const goTo = (i: number) => {
    const el = track.current!;
    el.scrollTo({ left: el.clientWidth * i, behavior: "smooth" });
  };

  return (
    <div className="reviews" id="reviews">
      <div className="reviews-head">
        <div className="kicker">Что говорят</div>
        <div className="stitle">Отзывы <em>наших гостей</em></div>
      </div>
      <div
        className="reviews-track"
        id="revTrack"
        ref={track}
        onScroll={() => setActive(current())}
      >
        <div className="reviews-list">
          {REVIEWS.map((r) => (
            <div className="review" key={r.name}>
              <div className="stars">★★★★★</div>
              <div className="quote">{r.quote}</div>
              <div className="who"><b>{r.name}</b> · {r.about}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="reviews-nav">
        <button className="rev-arrow" id="revPrev" aria-label="Предыдущий отзыв" onClick={() => goTo((current() - 1 + count) % count)}>←</button>
        <div className="reviews-dots" id="revDots">
          {REVIEWS.map((r, i) => (
            <button
              key={r.name}
              className={i === active ? "rd active" : "rd"}
              data-i={i}
              aria-label={`Отзыв ${i + 1}`}
              onClick={() => goTo(i)}
            ></button>
          ))}
        </div>
        <button className="rev-arrow" id="revNext" aria-label="Следующий отзыв" onClick={() => goTo((current() + 1) % count)}>→</button>
      </div>
    </div>
  );
}
