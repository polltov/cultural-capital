"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { ATTRIBUTION_COOKIE, ATTRIBUTION_MAX_AGE, attributionFromVisit, encodeAttribution } from "@/lib/attribution";
import {
  GOALS, METRIKA_ID, contactChannel, isPrivatePath, readConsent, saveConsent, subscribeConsent,
} from "@/lib/analytics";

const TAG_SRC = "https://mc.yandex.ru/metrika/tag.js";

/** Очередь вызовов до загрузки tag.js — так же, как в официальном коде счётчика, — и сам скрипт. */
function loadMetrika(id: number): void {
  if (window.ym) return;
  const ym: NonNullable<Window["ym"]> = (...args) => {
    (ym.a ??= []).push(args);
  };
  ym.l = Date.now();
  window.ym = ym;
  const script = document.createElement("script");
  script.async = true;
  script.src = TAG_SRC;
  document.head.appendChild(script);
  // defer: просмотры отправляем сами (ниже), чтобы адреса закрытых страниц в Метрику не уходили.
  // Карта кликов, ссылки и Вебвизор выключены: они передавали бы содержимое и адреса страниц без нашего контроля.
  ym(id, "init", { defer: true, clickmap: false, trackLinks: false, accurateTrackBounce: true, webvisor: false });
}

/** Запоминает источник визита в cookie для заказа (src/lib/attribution.ts). Прямой заход прежний источник не трогает. */
function rememberSource(): void {
  const a = attributionFromVisit(window.location.href, document.referrer);
  if (!a) return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${ATTRIBUTION_COOKIE}=${encodeAttribution(a)}; Path=/; Max-Age=${ATTRIBUTION_MAX_AGE}; SameSite=Lax${secure}`;
}

/**
 * Источник визита для заказа и Яндекс Метрика с согласия посетителя: плашка с вопросом, просмотры страниц,
 * цель «нажал на контакт». На страницах билета и входа в кабинет не делает ничего.
 */
export function Analytics() {
  const pathname = usePathname();
  const id = Number(METRIKA_ID);
  // На сервере и при гидратации — undefined: плашки нет, пока браузер не прочитал решение из localStorage.
  const consent = useSyncExternalStore(subscribeConsent, readConsent, () => undefined);
  const landing = useRef<{ href: string; referrer: string } | null>(null);
  const lastHit = useRef<string | null>(null);

  useEffect(() => {
    if (isPrivatePath(window.location.pathname)) return;
    landing.current = { href: window.location.href, referrer: document.referrer };
    rememberSource();
  }, []);

  // Просмотр страницы — после согласия и при каждом переходе по сайту. Первый просмотр — страница входа с её метками
  // и сайтом-источником, даже если согласие дали позже, уже на другой странице.
  useEffect(() => {
    if (!METRIKA_ID || consent !== "yes" || isPrivatePath(pathname)) return;
    loadMetrika(id);
    const ym = window.ym!;
    const href = window.location.href;
    if (lastHit.current === null && landing.current && landing.current.href !== href) {
      ym(id, "hit", landing.current.href, { referer: landing.current.referrer });
      lastHit.current = landing.current.href;
    }
    if (lastHit.current === href) return;
    ym(id, "hit", href, { referer: lastHit.current ?? document.referrer });
    lastHit.current = href;
  }, [consent, pathname, id]);

  useEffect(() => {
    if (!METRIKA_ID || consent !== "yes") return;
    const onClick = (e: MouseEvent) => {
      if (isPrivatePath(window.location.pathname)) return;
      const link = (e.target as Element | null)?.closest?.("a[href]");
      const channel = link ? contactChannel(link.getAttribute("href") ?? "") : null;
      if (channel) window.ym?.(id, "reachGoal", GOALS.contact, { channel });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [consent, id]);

  if (!METRIKA_ID || consent !== null || isPrivatePath(pathname)) return null;
  return (
    <section className="consent-bar" aria-label="Согласие на аналитику">
      <p className="consent-text">
        Разрешите Яндекс Метрике учитывать посещения (она сохраняет cookie) — так мы поймём, откуда о нас узнают.
        Подробнее — в <Link href="/privacy#analytics">политике</Link>.
      </p>
      <div className="consent-actions">
        <button type="button" className="btn btn--dark btn--sm" onClick={() => saveConsent("yes")}>
          Разрешить
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => saveConsent("no")}>
          Отказаться
        </button>
      </div>
    </section>
  );
}
