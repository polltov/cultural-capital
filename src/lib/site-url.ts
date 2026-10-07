/**
 * Публичный адрес сайта из `SITE_URL` для ссылок в письмах, Telegram и Open Graph — без слеша в конце, со схемой
 * (`kc.example` → `https://kc.example`). Не задан — локальный `http://localhost:3000`.
 * Ссылка `return_url` после оплаты от него не зависит: виджет берёт адрес страницы, на которой открыт.
 */
export function siteUrl(): string {
  const raw = (process.env.SITE_URL ?? "").trim() || "http://localhost:3000";
  const base = raw.replace(/\/+$/, "");
  return /^[a-z][a-z\d+.-]*:\/\//i.test(base) ? base : `https://${base}`;
}
