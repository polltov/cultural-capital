import { formatRub } from "./pricing";

/** Остановки маршрута из строки «Заячий остров · Петропавловский собор · Невские ворота». */
export function routeStops(route: string): string[] {
  return route
    .split(/\s*[·•]\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export type PriceLine = { label: string; price: number };

/** Цены для показа: одна, если детский и взрослый билет стоят одинаково, иначе обе. */
export function priceLines(t: { priceChild: number; priceAdult: number }): PriceLine[] {
  if (t.priceChild === t.priceAdult) return [{ label: "Билет", price: t.priceChild }];
  return [
    { label: "Детский", price: t.priceChild },
    { label: "Взрослый", price: t.priceAdult },
  ];
}

/** Короткая цена для карточки: «2 200 ₽» или «1 390 ₽» (детский) — детский билет главный в семейных программах. */
export function headlinePrice(t: { priceChild: number; priceAdult: number }): { price: string; note: string | null } {
  if (t.priceChild === t.priceAdult) return { price: formatRub(t.priceChild), note: null };
  return { price: formatRub(t.priceChild), note: `детский · взрослый ${formatRub(t.priceAdult)}` };
}

/** Описание для поисковиков и превью ссылок: подзаголовок, маршрут, длительность и возраст, до 160 символов. */
export function tourMetaDescription(t: { title: string; subtitle: string; route: string; durationLabel: string; ageLabel: string }): string {
  const head = [t.title, t.subtitle.trim()].filter(Boolean).join(" — ");
  const stops = routeStops(t.route).join(", ");
  const facts = [t.durationLabel.trim(), t.ageLabel.trim()].filter(Boolean).join(", ");
  const text = [head, stops, facts && `${facts}. Билеты онлайн`].filter(Boolean).join(". ");
  return text.length <= 160 ? text : `${text.slice(0, 157).trimEnd()}…`;
}

/** Номер варианта обложки-гравюры (0–3) для экскурсии без фото: зависит от адреса, а не от места в каталоге. */
export function coverVariant(key: string): number {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return h % 4;
}

/**
 * Гравюры для экскурсий без фото по порядку каталога: 0, 1, 2, 3, 0… — соседние карточки не повторяются.
 * Экскурсии с фото номер не занимают. Тот же расчёт на главной и на странице экскурсии — обложка одна и та же.
 */
export function coverVariants(tours: { slug: string; coverUrl: string | null }[]): Map<string, number> {
  const out = new Map<string, number>();
  let n = 0;
  for (const t of tours) if (!t.coverUrl) out.set(t.slug, n++ % 4);
  return out;
}
