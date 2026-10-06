import { formatDateNumeric, formatDayMonthNumeric, formatTime } from "./moscow-time";
import { toApiAmount } from "./pricing";

/** Лимит ЮKassa на описание платежа и позиции чека. */
const MAX_DESCRIPTION = 128;

type PaymentMode = "full_prepayment" | "full_payment";

export type ReceiptItem = {
  description: string;
  quantity: number;
  amount: { value: string; currency: "RUB" };
  vat_code: number;
  payment_subject: "service";
  payment_mode: PaymentMode;
};

export type ReceiptOrder = {
  tourTitle: string;
  startsAt: Date;
  children: number;
  adults: number;
  priceChild: number;
  priceAdult: number;
};

/** Обрезает название до `max` символов (с «…» на конце); пары-суррогаты не разрезает. */
function fitTitle(title: string, max: number): string {
  if (title.length <= max) return title;
  if (max <= 0) return "";
  let out = "";
  for (const ch of title) {
    if (out.length + ch.length > max - 1) break;
    out += ch;
  }
  return `${out}…`;
}

/** Описание = prefix + название + suffix, всего ≤ 128: обрезается только название, хвост сохраняется. */
function withTitle(prefix: string, title: string, suffix: string): string {
  return `${prefix}${fitTitle(title, MAX_DESCRIPTION - prefix.length - suffix.length)}${suffix}`;
}

/** «12.10.2026 11:00» (московское время). */
function dateTime(d: Date): string {
  return `${formatDateNumeric(d)} ${formatTime(d)}`;
}

export function paymentItems(o: ReceiptOrder, vatCode: number, mode: PaymentMode): ReceiptItem[] {
  const item = (kind: string, quantity: number, price: number): ReceiptItem => ({
    description: withTitle("Экскурсия «", o.tourTitle, `», ${dateTime(o.startsAt)}, ${kind}`),
    quantity,
    amount: { value: toApiAmount(price), currency: "RUB" },
    vat_code: vatCode,
    payment_subject: "service",
    payment_mode: mode,
  });
  const items: ReceiptItem[] = [];
  if (o.children > 0) items.push(item("детский билет", o.children, o.priceChild));
  if (o.adults > 0) items.push(item("взрослый билет", o.adults, o.priceAdult));
  return items;
}

/** Чек возврата: одна позиция на всю сумму возврата. */
export function refundItems(o: { tourTitle: string; startsAt: Date }, amount: number, vatCode: number): ReceiptItem[] {
  return [
    {
      description: withTitle("Возврат: Экскурсия «", o.tourTitle, `», ${dateTime(o.startsAt)}`),
      quantity: 1,
      amount: { value: toApiAmount(amount), currency: "RUB" },
      vat_code: vatCode,
      payment_subject: "service",
      payment_mode: "full_prepayment",
    },
  ];
}

/** Описание платежа в ЮKassa: «КС-0057 · Эрмитаж · 12.10 11:00». */
export function paymentDescription(number: string, tourTitle: string, startsAt: Date): string {
  return withTitle(`${number} · `, tourTitle, ` · ${formatDayMonthNumeric(startsAt)} ${formatTime(startsAt)}`);
}
