"use client";

import { useEffect, useState } from "react";

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className={scrolled ? "top scrolled" : "top"}>
      <a className="logo" href="#top" aria-label="Культурная Столица">
        <span className="logo-blob"></span>
        <span className="logo-txt">Культурная Столица</span>
      </a>
      <div className="nav">
        <a href="#catalog">Экскурсии</a>
        <a href="#guides">Гиды</a>
        <a href="#about">О нас</a>
        <a href="#reviews">Отзывы</a>
        <button className="btn" type="button">Написать</button>
      </div>
    </div>
  );
}
