import { after } from "next/server";
import { runSyncEffects, syncPayment, syncRefund, type RefundNotice, type SyncOutcome } from "@/server/payment-sync";

const ok = () => new Response(null, { status: 200 });
const badRequest = () => new Response("Некорректное уведомление", { status: 400 });

/** Тело уведомления не подписано: в лог и журнал попадают только проверенные и обрезанные значения. */
const MAX_LEN = 100;
const TOKEN = /^[\w.-]+$/;

/** Событие или id: строка до 100 символов из латиницы, цифр, «_», «.», «-» (id ЮKassa — UUID). */
const isToken = (v: unknown): v is string => typeof v === "string" && v.length <= MAX_LEN && TOKEN.test(v);

/**
 * Прочие строки — первые 100 символов; не строка → `null`. Одиночные суррогаты и NUL убираются: jsonb их не примет,
 * и уведомление падало бы с 500 при каждом повторе.
 */
const capped = (v: unknown): string | null =>
  typeof v === "string" ? Array.from(v.slice(0, 2 * MAX_LEN).toWellFormed().replaceAll("\u0000", "")).slice(0, MAX_LEN).join("") : null;

const asObject = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {});

/**
 * Уведомления ЮKassa (`payment.*`, `refund.succeeded`). Подлинность — повторным запросом объекта через API
 * (`syncPayment`, `syncRefund`), телу уведомления не доверяем; проверки IP нет. Сбой БД/API → 500, ЮKassa повторяет 24 часа.
 * Тело в лог не пишем (в нём бывает email покупателя) — только проверенные событие и id.
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest();
  }
  const { event, object } = asObject(body);
  if (!isToken(event)) return badRequest();
  const obj = asObject(object);

  let outcome: SyncOutcome;
  if (event.startsWith("payment.")) {
    if (!isToken(obj.id)) return badRequest();
    try {
      outcome = await syncPayment(obj.id, "webhook");
    } catch (e) {
      console.error(`ЮKassa webhook ${event}: платёж ${obj.id} не обработан`, e);
      return new Response("Ошибка обработки", { status: 500 });
    }
  } else if (event === "refund.succeeded") {
    if (!isToken(obj.id) || !isToken(obj.payment_id)) return badRequest();
    const amount = asObject(obj.amount);
    const notice: RefundNotice = {
      id: obj.id,
      payment_id: obj.payment_id,
      status: capped(obj.status),
      amount: { value: capped(amount.value), currency: capped(amount.currency) },
    };
    try {
      outcome = await syncRefund(notice);
    } catch (e) {
      console.error(`ЮKassa webhook ${event}: возврат по платежу ${notice.payment_id} не обработан`, e);
      return new Response("Ошибка обработки", { status: 500 });
    }
  } else {
    // Остальные события нам не нужны (в кабинете подписка на три выше): подтверждаем, чтобы ЮKassa не повторяла.
    return ok();
  }

  // Письма и Telegram — после ответа: они не должны задерживать 200.
  after(() => runSyncEffects(outcome));
  return ok();
}
