"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SiteContent } from "@/lib/site-content";
import { Emphasis } from "./Emphasis";
import { IconArrow } from "./icons";

/** Отзывы лентой: на компьютере видно три, на телефоне листаются пальцем; стрелки сдвигают на один отзыв. */
export function ReviewsCarousel({ content }: { content: SiteContent["reviews"] }) {
  const track = useRef<HTMLUListElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });

  const update = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const start = el.scrollLeft <= 4;
    const end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
    setEdge((current) => current.start === start && current.end === end ? current : { start, end });
  }, []);
  useEffect(() => {
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [update, content.items.length]);

  const step = (dir: 1 | -1) => {
    const el = track.current;
    const card = el?.querySelector("li");
    if (!el || !card || (dir < 0 ? edge.start : edge.end)) return;
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth";
    el.scrollBy({ left: dir * (card.getBoundingClientRect().width + gap), behavior });
  };

  return (
    <section className="reviews" id="reviews" aria-labelledby="reviews-title">
      <div className="wrap">
        <div className="shead shead--start">
          <div className="shead-text">
            <p className="kicker">{content.kicker}</p>
            <h2 className="stitle" id="reviews-title"><Emphasis text={content.title} /></h2>
          </div>
          {content.items.length > 1 && (
            <div className="reviews-nav">
              <button type="button" className="rev-arrow rev-arrow--prev" aria-label="Предыдущий отзыв" aria-controls="reviews-track" aria-disabled={edge.start} onClick={() => step(-1)}><IconArrow /></button>
              <button type="button" className="rev-arrow" aria-label="Следующий отзыв" aria-controls="reviews-track" aria-disabled={edge.end} onClick={() => step(1)}><IconArrow /></button>
            </div>
          )}
        </div>
        {/* лента прокручивается — с клавиатуры тоже: фокус на ней и стрелки ← → */}
        <ul id="reviews-track" className="reviews-track" ref={track} onScroll={update} aria-label="Отзывы" tabIndex={0}>
          {content.items.map((r) => (
            <li className="review" key={r.id}>
              <figure>
                <span className="review-mark" aria-hidden="true">«</span>
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
