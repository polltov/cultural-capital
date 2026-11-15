/**
 * Публичный адрес сайта из `SITE_URL` для ссылок в письмах, Telegram и Open Graph — без слеша в конце, со схемой
 * (`kc.example` → `https://kc.example`). Не задан — локальный `http://localhost:3000`.
 * Кириллический домен можно записать как есть: в ссылки он попадает в punycode
 * (`культурнаястолица.рф` → `xn--80aaxgfbmjpmhegc7c3esc.xn--p1ai`). Так ссылка открывается в любой почте и
 * мессенджере, а sitemap и robots.txt остаются в том виде, которого ждут поисковики.
 * Ссылка `return_url` после оплаты от него не зависит: виджет берёт адрес страницы, на которой открыт.
 */
export function siteUrl(): string {
  const raw = (process.env.SITE_URL ?? "").trim() || "http://localhost:3000";
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
  } catch {
    return withScheme.replace(/\/+$/, "");
  }
}
