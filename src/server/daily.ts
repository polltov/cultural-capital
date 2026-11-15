import { and, asc, desc, eq, gt, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { db as sharedDb, type Db } from "@/db/client";
import { orders, tours, tourSessions } from "@/db/schema";
import { startOfMoscowDay } from "@/lib/domain/moscow-time";
import { occupiedSeats } from "@/server/orders";
import { sendAbandoned, sendReminder } from "@/server/ticket";

/** Сколько писем ушло за запуск; `failed` — не ушли (почта не настроена, сбой Resend или БД), повтор — при следующем запуске. */
export type DailyReport = { reminders: number; abandoned: number; failed: number };

const H = 3600_000;
const DAY = 24 * H;

/** Напоминание не шлём тем, кто купил билет только что: письмо с билетом пришло меньше этого времени назад. */
const FRESH_PURCHASE_MS = 6 * H;
/** «Вы не завершили оплату»: заказ создан не раньше этого срока назад (старые брошенные заказы не трогаем)… */
const ABANDONED_MAX_AGE_MS = 3 * DAY;
/** …и не позже часа назад: покупатель мог ещё вернуться сам. */
const ABANDONED_MIN_AGE_MS = H;
/** Экскурсия должна начаться не раньше чем через столько: иначе купить уже не успеют. */
const ABANDONED_LEAD_MS = 3 * H;
/** Одному адресу — не чаще одного такого письма за этот срок. */
const ABANDONED_PER_EMAIL_MS = 14 * DAY;

/** Письма «вы не завершили оплату» включаются переменной ABANDONED_MAIL=on (по умолчанию выключены). */
export function abandonedMailEnabled(): boolean {
  return process.env.ABANDONED_MAIL === "on";
}

type Mark = "reminderSentAt" | "abandonedMailSentAt";

/**
 * Отметка ставится ДО отправки и только если её ещё нет — так два параллельных запуска не пришлют письмо дважды.
 * Письмо не ушло — отметка снимается, и заказ попадёт в следующий запуск.
 */
async function claimAndSend(db: Db, orderId: number, mark: Mark, send: (id: number, db: Db) => Promise<boolean>): Promise<"sent" | "failed" | "skipped"> {
  const claimed = await db
    .update(orders)
    .set(mark === "reminderSentAt" ? { reminderSentAt: new Date() } : { abandonedMailSentAt: new Date() })
    .where(and(eq(orders.id, orderId), isNull(orders[mark])))
    .returning({ id: orders.id });
  if (claimed.length === 0) return "skipped";
  if (await send(orderId, db)) return "sent";
  await db
    .update(orders)
    .set(mark === "reminderSentAt" ? { reminderSentAt: null } : { abandonedMailSentAt: null })
    .where(eq(orders.id, orderId));
  return "failed";
}

/**
 * Дневная задача (Vercel Cron, вечер по Москве):
 * 1. Напоминание об экскурсии всем оплаченным заказам на сеансы до конца завтрашнего дня по Москве, которым его ещё не слали.
 *    Окно «до конца завтра» (а не «ровно завтра») подбирает и сегодняшние вечерние сеансы, если напоминание вчера не ушло.
 * 2. При ABANDONED_MAIL=on — «вы не завершили оплату» по неоплаченным заказам последних дней, если на ту же дату ещё хватает мест,
 *    а покупатель после этого не оформлял новых заказов.
 * Каждый заказ — в своём try/catch: сбой одного не останавливает остальных.
 */
export async function runDaily(deps: { db?: Db; now?: Date; abandoned?: boolean } = {}): Promise<DailyReport> {
  const db = deps.db ?? sharedDb;
  const now = deps.now ?? new Date();
  const report: DailyReport = { reminders: 0, abandoned: 0, failed: 0 };
  const count = (r: "sent" | "failed" | "skipped", what: "reminders" | "abandoned") => {
    if (r === "sent") report[what]++;
    if (r === "failed") report.failed++;
  };

  // 1. Напоминания.
  const until = new Date(startOfMoscowDay(now).getTime() + 2 * DAY);
  const due = await db
    .select({ id: orders.id })
    .from(orders)
    .innerJoin(tourSessions, eq(orders.sessionId, tourSessions.id))
    .where(
      and(
        eq(orders.status, "paid"),
        isNotNull(orders.email),
        isNotNull(orders.accessToken),
        isNull(orders.reminderSentAt),
        gt(tourSessions.startsAt, now),
        lt(tourSessions.startsAt, until),
        or(isNull(orders.paidAt), lt(orders.paidAt, new Date(now.getTime() - FRESH_PURCHASE_MS))),
      ),
    )
    .orderBy(asc(tourSessions.startsAt), asc(orders.id));
  for (const o of due) {
    try {
      count(await claimAndSend(db, o.id, "reminderSentAt", sendReminder), "reminders");
    } catch (e) {
      report.failed++;
      console.error(`Дневная задача (напоминание): сбой для заказа ${o.id}`, e);
    }
  }

  // 2. «Вы не завершили оплату».
  if (deps.abandoned ?? abandonedMailEnabled()) {
    const candidates = await db
      .select({
        id: orders.id, email: orders.email, createdAt: orders.createdAt, sessionId: orders.sessionId,
        seats: sql<number>`${orders.children} + ${orders.adults}`, capacity: tourSessions.capacity,
      })
      .from(orders)
      .innerJoin(tourSessions, eq(orders.sessionId, tourSessions.id))
      .innerJoin(tours, eq(tourSessions.tourId, tours.id))
      .where(
        and(
          eq(orders.status, "expired"),
          // Платёж прошёл, но поздно (ждёт автовозврата или ручного разбора) — такому покупателю это письмо не к месту.
          or(isNull(orders.paymentStatus), sql`${orders.paymentStatus} <> 'succeeded'`),
          isNotNull(orders.email),
          isNotNull(orders.accessToken),
          isNull(orders.abandonedMailSentAt),
          gt(orders.createdAt, new Date(now.getTime() - ABANDONED_MAX_AGE_MS)),
          lt(orders.createdAt, new Date(now.getTime() - ABANDONED_MIN_AGE_MS)),
          gt(tourSessions.startsAt, new Date(now.getTime() + ABANDONED_LEAD_MS)),
          eq(tourSessions.hidden, false),
          eq(tours.published, true),
          // Покупатель возвращался: после этого заказа оформлял другой (любой) — ему писать незачем.
          sql`not exists (
            select 1 from ${orders} later
            where lower(later.email) = lower(${orders.email}) and later.id <> ${orders.id} and later.created_at > ${orders.createdAt}
          )`,
          // Такое письмо на этот адрес уже уходило недавно.
          sql`not exists (
            select 1 from ${orders} sent
            where lower(sent.email) = lower(${orders.email}) and sent.abandoned_mail_sent_at > ${new Date(now.getTime() - ABANDONED_PER_EMAIL_MS).toISOString()}::timestamptz
          )`,
        ),
      )
      .orderBy(desc(orders.createdAt), desc(orders.id));

    const seen = new Set<string>();
    for (const c of candidates) {
      // По одному письму на адрес за запуск — о самом свежем заказе.
      const email = c.email!.toLowerCase();
      if (seen.has(email)) continue;
      seen.add(email);
      try {
        if (c.capacity - (await occupiedSeats(db, c.sessionId)) < c.seats) continue;
        count(await claimAndSend(db, c.id, "abandonedMailSentAt", sendAbandoned), "abandoned");
      } catch (e) {
        report.failed++;
        console.error(`Дневная задача (незавершённая оплата): сбой для заказа ${c.id}`, e);
      }
    }
  }

  return report;
}
