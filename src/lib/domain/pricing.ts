export function orderTotal(p: { children: number; adults: number; priceChild: number; priceAdult: number }): number {
  return p.children * p.priceChild + p.adults * p.priceAdult;
}

/** Сумма для API ЮKassa: целые рубли → строка с двумя знаками («1700.00»). */
export function toApiAmount(rub: number): string {
  return rub.toFixed(2);
}

export function formatRub(n: number): string {
  const grouped = n.toLocaleString("ru-RU").replace(/[  ]/g, " ");
  return `${grouped} ₽`;
}
