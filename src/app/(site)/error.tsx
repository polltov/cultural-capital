"use client";

import { useEffect } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/site/SiteHeader";

/**
 * Страница сайта не смогла отрисоваться (например, база недоступна). Вместо белого экрана — шапка с навигацией,
 * понятный текст и «Повторить». Подробности ошибки посетителю не показываем: они в логах сервера (по `digest`).
 */
export default function SiteError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="site">
      <SiteHeader />
      <main id="main">
        <div className="wrap nf" role="alert">
          <div className="nf-art" aria-hidden="true" />
          <p className="nf-code">Ошибка</p>
          <h1 className="nf-title">Что-то пошло <em>не так</em></h1>
          <p className="nf-text">
            Страница не загрузилась. Попробуйте ещё раз — обычно это помогает. Если вы только что оплатили билет, он придёт на почту,
            как только банк подтвердит платёж.
          </p>
          <div className="nf-actions">
            <button type="button" className="btn btn--dark" onClick={() => retry()}>Повторить</button>
            <Link className="btn btn--ghost" href="/">На главную</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
