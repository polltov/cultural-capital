// Яндекс Метрика на публичных страницах (src/components/site/Analytics.tsx). Счётчик загружается только после согласия
// посетителя, на страницах с секретной ссылкой в адресе (билет, вход в кабинет) не работает вовсе, карту кликов и
// Вебвизор не включает. Настройка счётчика и целей — README, раздел «Аналитика».

/**
 * Номер счётчика Метрики, например «98765432». Заполняет владелец сайта после создания счётчика. Пусто — счётчика нет:
 * ни скрипта, ни плашки с вопросом о согласии. Номер не секрет: он виден в коде любой страницы со счётчиком.
 */
export const METRIKA_ID = "";

/** Цели «JavaScript-событие»; в настройках счётчика их идентификаторы должны совпадать с этими. */
export const GOALS = {
  /** Открыл окно покупки билета. */
  checkoutOpen: "checkout_open",
  /** Заполнил данные и дошёл до формы оплаты; передаёт сумму заказа. */
  checkoutPay: "checkout_pay",
  /** Нажал на Telegram, WhatsApp, ВКонтакте, телефон или почту. */
  contact: "contact_click",
} as const;

/** Решение посетителя в localStorage: «yes» — разрешил, «no» — отказался, нет записи — ещё не спрашивали. */
export const CONSENT_KEY = "kc-analytics";
/** Событие на window: решение изменилось (плашка или кнопка в политике). */
export const CONSENT_EVENT = "kc-analytics-consent";

export type Consent = "yes" | "no" | null;

type Ym = ((id: number, method: string, ...args: unknown[]) => void) & { a?: unknown[][]; l?: number };

declare global {
  interface Window {
    ym?: Ym;
  }
}

/** Адреса с секретом в пути: ссылка на билет /order/<токен>, вход в кабинет /account/login/<токен>. */
export function isPrivatePath(pathname: string): boolean {
  return /^\/(order|account)(\/|$)/.test(pathname);
}

// Решение, если localStorage не даёт записать (приватный режим): действует, пока открыта страница.
let memory: Consent | undefined;

export function readConsent(): Consent {
  if (memory !== undefined) return memory;
  try {
    const v = window.localStorage.getItem(CONSENT_KEY);
    return v === "yes" || v === "no" ? v : null;
  } catch {
    return null;
  }
}

export function saveConsent(value: "yes" | "no"): void {
  try {
    window.localStorage.setItem(CONSENT_KEY, value);
    memory = undefined;
  } catch {
    memory = value;
  }
  window.dispatchEvent(new Event(CONSENT_EVENT));
}

/** Подписка для useSyncExternalStore: решение меняется на этой странице или в другой вкладке. */
export function subscribeConsent(onChange: () => void): () => void {
  window.addEventListener(CONSENT_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CONSENT_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Цель в Метрике. Без счётчика или без согласия (счётчик не загружен) ничего не делает. */
export function reachGoal(goal: string, params?: Record<string, unknown>): void {
  if (!METRIKA_ID || typeof window === "undefined" || !window.ym) return;
  window.ym(Number(METRIKA_ID), "reachGoal", goal, params);
}

/** Канал по ссылке «Написать»/контактам; `null` — это не контакт. */
export function contactChannel(href: string): string | null {
  if (/^https:\/\/t\.me\//i.test(href)) return "telegram";
  if (/^https:\/\/wa\.me\//i.test(href)) return "whatsapp";
  if (/^https:\/\/(m\.)?vk\.(com|ru)\//i.test(href)) return "vk";
  if (/^tel:/i.test(href)) return "phone";
  if (/^mailto:/i.test(href)) return "email";
  return null;
}
