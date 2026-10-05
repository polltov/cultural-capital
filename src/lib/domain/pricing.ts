export function orderTotal(p: { children: number; adults: number; priceChild: number; priceAdult: number }): number {
  return p.children * p.priceChild + p.adults * p.priceAdult;
}

export function formatRub(n: number): string {
  const grouped = n.toLocaleString("ru-RU").replace(/[  ]/g, " ");
  return `${grouped} ₽`;
}
