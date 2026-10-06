"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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
      <Link className="logo" href="/#top" aria-label="Культурная Столица">
        <span className="logo-blob"></span>
        <span className="logo-txt">Культурная Столица</span>
      </Link>
      <div className="nav">
        <Link href="/#catalog">Экскурсии</Link>
        <Link href="/#about">О нас</Link>
        <Link href="/#reviews">Отзывы</Link>
        <Link href="/news">Новости</Link>
        <button className="btn" type="button">Написать</button>
      </div>
    </div>
  );
}
