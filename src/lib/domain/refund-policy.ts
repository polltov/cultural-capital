const DAY_MS = 24 * 60 * 60 * 1000;

/** Сумма возврата по умолчанию (в целых рублях): не позже чем за 24 ч до начала — полная, иначе половина с округлением вверх. */
export function defaultRefundAmount(total: number, startsAt: Date, now: Date): number {
  return startsAt.getTime() - now.getTime() >= DAY_MS ? total : Math.ceil(total / 2);
}
