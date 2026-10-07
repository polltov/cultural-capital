"use client";

import { useEffect, useEffectEvent } from "react";

const WIDGET_SRC = "https://yookassa.ru/checkout-widget/v1/checkout-widget.js";

// Минимум из документации виджета ЮKassa — только то, чем пользуемся.
type WidgetOptions = {
  confirmation_token: string;
  return_url: string;
  customization?: { colors?: { control_primary?: string } };
  error_callback?: (error: unknown) => void;
};
type Widget = { render(containerId: string): Promise<unknown> | void; destroy(): void };

declare global {
  interface Window {
    YooMoneyCheckoutWidget?: new (options: WidgetOptions) => Widget;
  }
}

// Скрипт подгружается один раз на страницу, сколько бы раз ни открывали оплату.
let scriptLoading: Promise<void> | null = null;

function loadWidgetScript(): Promise<void> {
  if (window.YooMoneyCheckoutWidget) return Promise.resolve();
  scriptLoading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    const fail = (message: string) => {
      // Неудачу не запоминаем: следующая попытка оплаты подгрузит скрипт заново.
      script.remove();
      scriptLoading = null;
      reject(new Error(message));
    };
    script.src = WIDGET_SRC;
    script.async = true;
    script.onload = () => (window.YooMoneyCheckoutWidget ? resolve() : fail("Скрипт ЮKassa загружен, но виджета в нём нет"));
    script.onerror = () => fail("Не удалось загрузить скрипт виджета ЮKassa");
    document.head.appendChild(script);
  });
  return scriptLoading;
}

/** Платёжная форма ЮKassa. Живёт, пока смонтирован: при размонтировании виджет уничтожается. */
export function PaymentWidget({ confirmationToken, returnUrl, onError }: {
  confirmationToken: string;
  returnUrl: string;
  onError: () => void;
}) {
  // Свежий onError без перезапуска виджета при каждой перерисовке родителя.
  const reportError = useEffectEvent(onError);

  useEffect(() => {
    let cancelled = false;
    let widget: Widget | null = null;
    loadWidgetScript()
      .then(() => {
        // Размонтировали, пока грузился скрипт (закрыли окно, «Изменить», StrictMode) — виджет не нужен.
        if (cancelled) return;
        widget = new window.YooMoneyCheckoutWidget!({
          confirmation_token: confirmationToken,
          return_url: returnUrl,
          customization: { colors: { control_primary: "#a34a2f" } },
          error_callback: (error) => {
            console.error("Виджет ЮKassa сообщил об ошибке", error);
            if (!cancelled) reportError();
          },
        });
        return widget.render("payment-form");
      })
      .catch((error) => {
        console.error("Не удалось показать форму оплаты", error);
        if (!cancelled) reportError();
      });
    return () => {
      cancelled = true;
      widget?.destroy();
    };
  }, [confirmationToken, returnUrl]);

  return <div id="payment-form" className="bk-widget" />;
}
