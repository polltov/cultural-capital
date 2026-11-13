export type LoneFlags = { two: boolean; three: boolean };

/**
 * Какие карточки каталога остаются одни в своём ряду — при двух колонках (планшет) и при трёх (компьютер).
 * Крупная карточка (`featured`) всегда занимает ряд целиком и начинает новый, поэтому обычные карточки идут «пачками»
 * между крупными; если в пачке при делении на число колонок остаётся одна карточка — она последняя и одинокая.
 * Такую карточку каталог растягивает на весь ряд, чтобы рядом с ней не было пустоты.
 */
export function loneCards(items: { featured: boolean }[]): LoneFlags[] {
  const flags: LoneFlags[] = items.map(() => ({ two: false, three: false }));
  for (const [key, cols] of [["two", 2], ["three", 3]] as const) {
    let run: number[] = [];
    const flush = () => {
      if (run.length % cols === 1) flags[run[run.length - 1]][key] = true;
      run = [];
    };
    items.forEach((item, i) => {
      if (item.featured) flush();
      else run.push(i);
    });
    flush();
  }
  return flags;
}

/** Классы ячейки сетки каталога для карточки. */
export function cellClass(featured: boolean, lone: LoneFlags): string {
  return ["catalog-cell", featured && "is-featured", lone.two && "is-lone-2", lone.three && "is-lone-3"].filter(Boolean).join(" ");
}
