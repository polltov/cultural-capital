"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { contactLinks, externalProps, writeUsHref } from "@/lib/contacts";
import { IconClose, IconMenu } from "./icons";
import { Logo, NAV } from "./Logo";

export function SiteHeader({ cta = { href: "/afisha", label: "Купить билет" } }: { cta?: { href: string; label: string } }) {
  const [scrolled, setScrolled] = useState(false);
  const menu = useRef<HTMLDialogElement>(null);
  const writeUs = writeUsHref();
  const contacts = contactLinks();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const close = () => menu.current?.close();

  return (
    <header className={scrolled ? "top is-scrolled" : "top"}>
      <div className="wrap top-row">
        <Logo />
        <nav className="nav" aria-label="Основное меню">
          {NAV.map((n) => <Link key={n.href} href={n.href}>{n.label}</Link>)}
        </nav>
        <div className="top-actions">
          {writeUs && <a className="top-write" href={writeUs} {...externalProps(writeUs)}>Написать</a>}
          <Link className="btn btn--primary btn--sm top-cta" href={cta.href}>{cta.label}</Link>
          <button type="button" className="burger" aria-label="Меню" aria-haspopup="dialog" onClick={() => menu.current?.showModal()}>
            <IconMenu />
          </button>
        </div>
      </div>

      {/* Мобильное меню — модальный dialog: фокус внутри, Esc закрывает, страница под ним недоступна */}
      <dialog ref={menu} className="menu" aria-label="Меню" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
        <div className="menu-inner">
          <div className="menu-head">
            <Logo className="logo" />
            <button type="button" className="burger" aria-label="Закрыть меню" onClick={close}><IconClose /></button>
          </div>
          <nav className="menu-nav" aria-label="Разделы">
            {NAV.map((n) => <Link key={n.href} href={n.href} onClick={close}>{n.label}</Link>)}
          </nav>
          <Link className="btn btn--primary menu-cta" href={cta.href} onClick={close}>{cta.label}</Link>
          {contacts.length > 0 && (
            <ul className="menu-contacts">
              {contacts.map((c) => (
                <li key={c.kind}><a href={c.href} {...externalProps(c.href)}><span>{c.label}</span>{c.value}</a></li>
              ))}
            </ul>
          )}
        </div>
      </dialog>
    </header>
  );
}
