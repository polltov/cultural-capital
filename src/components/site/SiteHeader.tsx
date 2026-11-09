"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { writeUsHref } from "@/lib/contacts";

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const writeUs = writeUsHref();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className={scrolled ? "top scrolled" : "top"}>
      <Link className="logo" href="/#top" aria-label="Культурная Столица">
        <Image className="logo-mark" src="/assets/logo-icon.png" width={33} height={36} alt="" loading="eager" />
        <span className="logo-txt">Культурная Столица</span>
      </Link>
      <div className="nav">
        <Link href="/#catalog">Экскурсии</Link>
        <Link href="/#about">О нас</Link>
        <Link href="/#reviews">Отзывы</Link>
        <Link href="/news">Новости</Link>
        {writeUs && (
          <a className="btn" href={writeUs} {...(writeUs.startsWith("http") ? { target: "_blank", rel: "noopener" } : {})}>
            Написать
          </a>
        )}
      </div>
    </div>
  );
}
