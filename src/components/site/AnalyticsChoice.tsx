"use client";

import { useSyncExternalStore } from "react";
import { METRIKA_ID, readConsent, saveConsent, subscribeConsent } from "@/lib/analytics";

// Cookie, которые ставит счётчик Метрики на домене сайта.
const YM_COOKIES = ["_ym_uid", "_ym_d", "_ym_isad", "_ym_visorc", "_ym_hostIndex"];

function dropMetrikaCookies(): void {
  const host = window.location.hostname;
  const domains = ["", host, `.${host}`, `.${host.replace(/^www\./, "")}`];
  for (const name of YM_COOKIES) {
    for (const d of domains) document.cookie = `${name}=; Max-Age=0; Path=/${d ? `; Domain=${d}` : ""}`;
  }
}

/** В политике: текущее решение о Метрике и кнопка, чтобы его изменить. Без счётчика не показывается. */
export function AnalyticsChoice() {
  const consent = useSyncExternalStore(subscribeConsent, readConsent, () => undefined);
  if (!METRIKA_ID || consent === undefined) return null;

  const revoke = () => {
    saveConsent("no");
    dropMetrikaCookies();
    // Скрипт счётчика уже загружен на этой странице — перезагрузка выгружает его.
    window.location.reload();
  };

  return (
    <p className="consent-choice">
      {consent === "yes" ? (
        <>
          Вы разрешили Яндекс Метрику на этом устройстве.{" "}
          <button type="button" className="btn btn--ghost btn--sm" onClick={revoke}>
            Отозвать согласие
          </button>
        </>
      ) : (
        <>
          Яндекс Метрика на этом устройстве {consent === "no" ? "выключена по вашему решению" : "не работает, пока вы её не разрешите"}.{" "}
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => saveConsent("yes")}>
            Разрешить
          </button>
        </>
      )}
    </p>
  );
}
