"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { externalProps, writeUsHref, type ContactLink } from "@/lib/contacts";
import { IconClose, IconMenu } from "./icons";
import { Logo, NAV } from "./Logo";

export function SiteHeader({ cta, contacts, nav = NAV }: {
  cta?: { href: string; label: string };
  contacts: ContactLink[];
  nav?: typeof NAV;
}) {
  const [scrolled, setScrolled] = useState(false);
  const menu = useRef<HTMLDialogElement>(null);
  const writeUs = writeUsHref(contacts);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const close = () => menu.current?.close();

  return (
    // своё имя в переходах: при сдвиге страницы шапка стоит на месте (site.css, «Переходы между страницами»)
    <header className={scrolled ? "top is-scrolled" : "top"} style={{ viewTransitionName: "site-header" }}>
      <div className="wrap top-row">
        <Logo />
        <nav className="nav" aria-label="Основное меню">
          {nav.map((n) => <Link key={n.href} href={n.href}>{n.label}</Link>)}
        </nav>
        <div className="top-actions">
          <Link className="top-write" href="/account">Мои билеты</Link>
          {writeUs && writeUs !== cta?.href && <a className="top-write" href={writeUs} {...externalProps(writeUs)}>Написать</a>}
          {cta && <Link className="btn btn--primary btn--sm top-cta" href={cta.href} {...externalProps(cta.href)}>{cta.label}</Link>}
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
            {nav.map((n) => <Link key={n.href} href={n.href} onClick={close}>{n.label}</Link>)}
          </nav>
          {cta && <Link className="btn btn--primary menu-cta" href={cta.href} {...externalProps(cta.href)} onClick={close}>{cta.label}</Link>}
          <Link className="menu-account" href="/account" onClick={close}>Мои билеты</Link>
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
