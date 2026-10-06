import type { PaymentGateway } from "./types";
import { yookassaGateway } from "./yookassa";

// Env читается в момент вызова, а не при импорте: модули, которые импортируют шлюз, не требуют настроек ЮKassa.

export function paymentGateway(): PaymentGateway {
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secretKey = process.env.YOOKASSA_SECRET_KEY;
  if (!shopId || !secretKey) throw new Error("ЮKassa не настроена");
  return yookassaGateway({ shopId, secretKey });
}

/** Код ставки НДС для чеков (по умолчанию 1 — «без НДС»); ставку подтверждает бухгалтер. */
export function vatCode(): number {
  const raw = process.env.YOOKASSA_VAT_CODE?.trim();
  if (!raw) return 1;
  const code = Number(raw);
  // Неверная ставка в чеке хуже отказа: падаем, а не подставляем 1 молча.
  if (!Number.isInteger(code) || code < 1) throw new Error(`YOOKASSA_VAT_CODE должен быть целым числом ≥ 1, получено «${raw}»`);
  return code;
}

/** Закрывающий чек «Полный расчёт» после экскурсии — только при RECEIPT_CLOSING=on. */
export function closingReceiptsEnabled(): boolean {
  return process.env.RECEIPT_CLOSING === "on";
}
