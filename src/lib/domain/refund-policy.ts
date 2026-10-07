const DAY_MS = 24 * 60 * 60 * 1000;

/** Сумма возврата по умолчанию (в целых рублях): не позже чем за 24 ч до начала — полная, иначе половина с округлением вверх. */
export function defaultRefundAmount(total: number, startsAt: Date, now: Date): number {
  return startsAt.getTime() - now.getTime() >= DAY_MS ? total : Math.ceil(total / 2);
}

/** Условия отмены словами (письма с билетом и страница заказа); правило то же, что в оферте и в `defaultRefundAmount`. */
export const CANCEL_TERMS =
  "Отменить или перенести билет без потерь можно не позднее чем за 24 часа до начала экскурсии; при отмене позже возвращаем 50% стоимости. Для отмены напишите или позвоните нам.";
