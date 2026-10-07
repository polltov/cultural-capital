import { after } from "next/server";
import { recordPaymentEvent, runSyncEffects, syncPayment, type SyncOutcome } from "@/server/payment-sync";

const ok = () => new Response(null, { status: 200 });
const badRequest = () => new Response("Некорректное уведомление", { status: 400 });

const nonEmptyString = (v: unknown): v is string => typeof v === "string" && v !== "";

/**
 * Уведомления ЮKassa (`payment.*`, `refund.succeeded`). Подлинность — повторным запросом объекта через API
 * (`syncPayment`), телу уведомления не доверяем; проверки IP нет. Сбой БД/API → 500, ЮKassa повторяет 24 часа.
 * Тело в лог не пишем (в нём бывает email покупателя) — только событие и id.
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest();
  }
  const { event, object } = (typeof body === "object" && body !== null ? body : {}) as { event?: unknown; object?: unknown };
  if (typeof event !== "string") return badRequest();
  const obj = (typeof object === "object" && object !== null ? object : {}) as { id?: unknown; payment_id?: unknown };

  if (event.startsWith("payment.")) {
    if (!nonEmptyString(obj.id)) return badRequest();
    const paymentId = obj.id;
    let outcome: SyncOutcome;
    try {
      outcome = await syncPayment(paymentId, "webhook");
    } catch (e) {
      console.error(`ЮKassa webhook ${event}: платёж ${paymentId} не обработан`, e);
      return new Response("Ошибка обработки", { status: 500 });
    }
    // Письма и Telegram — после ответа: они не должны задерживать 200.
    after(() => runSyncEffects(outcome));
    return ok();
  }

  if (event === "refund.succeeded") {
    if (!nonEmptyString(obj.payment_id)) return badRequest();
    const paymentId = obj.payment_id;
    try {
      // Статус заказа уже выставлен синхронно в `refundOrder`, здесь — только журнал.
      await recordPaymentEvent({ source: "webhook", event, paymentId, payload: body, note: event });
    } catch (e) {
      console.error(`ЮKassa webhook ${event}: платёж ${paymentId} не записан в журнал`, e);
      return new Response("Ошибка обработки", { status: 500 });
    }
    return ok();
  }

  // Остальные события нам не нужны (в кабинете подписка на три выше): подтверждаем, чтобы ЮKassa не повторяла.
  return ok();
}
