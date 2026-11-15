// Источник визита для отчёта «Источники продаж»: UTM-метки из адреса, по которому человек пришёл на сайт, а без них —
// сайт, с которого он перешёл. Хранится в cookie браузера и записывается в заказ при покупке (src/app/(site)/actions.ts).
// Модель — последний непрямой заход за 30 дней: заход по закладке или набранному адресу не затирает метку рекламы,
// по которой человек пришёл раньше. В cookie нет ничего о самом человеке — только метки и домен сайта-источника.

export type Attribution = {
  /** utm_source или домен сайта, с которого перешли. */
  source: string;
  /** utm_medium; без меток — organic (поисковик), social (соцсеть, мессенджер) или referral (другой сайт). */
  medium: string;
  campaign: string;
  content: string;
  term: string;
  /** Домен сайта, с которого перешли, без пути; "" — неизвестен (браузер не передал или это был прямой заход). */
  referrer: string;
};

export const ATTRIBUTION_COOKIE = "kc_src";
export const ATTRIBUTION_MAX_AGE = 30 * 24 * 3600;

const MAX_LEN = 100;
const SEARCH = /(^|\.)(yandex\.[a-z.]+|ya\.ru|google\.[a-z.]+|bing\.com|go\.mail\.ru|duckduckgo\.com)$/;
const SOCIAL = /(^|\.)(vk\.com|vk\.ru|m\.vk\.com|ok\.ru|t\.me|web\.telegram\.org|dzen\.ru|rutube\.ru|youtube\.com)$/;
// Возврат со страницы оплаты — не новый источник: иначе каждая покупка записывалась бы на ЮKassa.
const IGNORED = /(^|\.)(yookassa\.ru|yoomoney\.ru)$/;

/** Строка из адреса или cookie: без управляющих символов, обрезанная до 100 знаков. */
function clean(v: unknown): string {
  if (typeof v !== "string") return "";
  return Array.from(v.replace(/[\u0000-\u001f\u007f]/g, "").trim()).slice(0, MAX_LEN).join("");
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Источник визита по адресу страницы входа и `document.referrer`. `null` — прямой или внутренний заход:
 * такой визит не меняет ранее сохранённый источник.
 */
export function attributionFromVisit(href: string, referrer: string): Attribution | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const own = url.hostname.toLowerCase().replace(/^www\./, "");
  const refHost = hostOf(referrer);
  const external = refHost && refHost !== own && !IGNORED.test(refHost) ? clean(refHost) : "";
  const p = url.searchParams;

  const utmSource = clean(p.get("utm_source"));
  if (utmSource) {
    return {
      source: utmSource,
      medium: clean(p.get("utm_medium")),
      campaign: clean(p.get("utm_campaign")),
      content: clean(p.get("utm_content")),
      term: clean(p.get("utm_term")),
      referrer: external,
    };
  }
  // Яндекс Директ с автоматической разметкой добавляет к ссылке только yclid.
  if (p.has("yclid")) return { source: "yandex", medium: "cpc", campaign: "", content: "", term: "", referrer: external };
  if (!external) return null;
  const medium = SEARCH.test(external) ? "organic" : SOCIAL.test(external) ? "social" : "referral";
  return { source: external, medium, campaign: "", content: "", term: "", referrer: external };
}

export function encodeAttribution(a: Attribution): string {
  return encodeURIComponent(JSON.stringify(a));
}

/** Значение cookie → источник; что угодно испорченное или подделанное → `null`, покупку это не останавливает. */
export function parseAttribution(raw: string | null | undefined): Attribution | null {
  if (!raw || raw.length > 4096) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    try {
      v = JSON.parse(decodeURIComponent(raw));
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const a: Attribution = {
    source: clean(o.source), medium: clean(o.medium), campaign: clean(o.campaign),
    content: clean(o.content), term: clean(o.term), referrer: clean(o.referrer),
  };
  return a.source ? a : null;
}

/** Подпись источника для админки: «vk / cpc · zima-2027» или «Прямой заход», если источника нет. */
export function attributionLabel(a: { source: string | null; medium: string | null; campaign: string | null }): string {
  if (!a.source) return "Прямой заход";
  const head = a.medium ? `${a.source} / ${a.medium}` : a.source;
  return a.campaign ? `${head} · ${a.campaign}` : head;
}
