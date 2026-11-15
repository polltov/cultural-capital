import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { db as sharedDb, type Db } from "@/db/client";
import { customerLoginTokens, orders, tours, tourSessions } from "@/db/schema";
import type { OrderStatus } from "@/lib/domain/order-status";
import { formatOrderNumber } from "@/lib/domain/order-number";
import { siteUrl } from "@/lib/site-url";
import { sendMail } from "@/server/mail/send";
import { accountLinkEmail } from "@/server/mail/templates";
import { hitRateLimit } from "@/server/rate-limit";

const LINK_TTL_MS = 30 * 60_000;
/** Заказы, которые покупатель видит в кабинете: оплаченные, проведённые и отменённые (неоплаченные — нет). */
export const ACCOUNT_STATUSES = ["paid", "done", "cancelled"] as const satisfies readonly OrderStatus[];

const hash = (token: string) => createHash("sha256").update(token, "utf8").digest("hex");
/** Ключ лимита по адресу — без самого адреса: таблица лимитов хранит ключи до суток. */
const emailKey = (email: string) => `account-link:${hash(email).slice(0, 24)}`;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export type LinkRequestResult = "sent" | "skipped" | "limited";

/**
 * Запрос ссылки входа. Письмо уходит, только если на этот адрес есть заказы, — но посетителю ответ всегда один и тот же,
 * чтобы по нему нельзя было проверять, покупал ли кто-то билеты. Лимиты: 5 запросов с IP и 3 на адрес в час.
 * `limited` вызывающий показывает как «слишком много попыток», `sent`/`skipped` — одинаково.
 */
export async function requestLoginLink(rawEmail: string, ip: string, db: Db = sharedDb): Promise<LinkRequestResult> {
  const email = normalizeEmail(rawEmail);
  if (!(await hitRateLimit(`account-ip:${ip}`, 5, 3600, db))) return "limited";
  if (!(await hitRateLimit(emailKey(email), 3, 3600, db))) return "limited";

  const [has] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(sql`lower(${orders.email}) = ${email}`, inArray(orders.status, [...ACCOUNT_STATUSES]), isNotNull(orders.accessToken)))
    .limit(1);
  // Старые ссылки (любые) больше суток не храним.
  await db.delete(customerLoginTokens).where(lt(customerLoginTokens.expiresAt, new Date(Date.now() - 24 * 3600_000)));
  if (!has) return "skipped";

  const token = randomBytes(32).toString("base64url");
  await db.insert(customerLoginTokens).values({ email, tokenHash: hash(token), expiresAt: new Date(Date.now() + LINK_TTL_MS) });
  const ok = await sendMail({ to: email, ...accountLinkEmail(`${siteUrl()}/account/login/${token}`) });
  return ok ? "sent" : "skipped";
}

/** Гасит ссылку и возвращает email; `null` — ссылка не наша, истекла или уже использована. */
export async function consumeLoginToken(token: string, db: Db = sharedDb): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [r] = await db
    .update(customerLoginTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(customerLoginTokens.tokenHash, hash(token)), isNull(customerLoginTokens.usedAt), gt(customerLoginTokens.expiresAt, new Date())))
    .returning({ email: customerLoginTokens.email });
  return r?.email ?? null;
}

export type AccountOrder = {
  number: string;
  status: (typeof ACCOUNT_STATUSES)[number];
  tourTitle: string;
  startsAt: Date;
  children: number;
  adults: number;
  total: number;
  refundedAmount: number;
  accessToken: string;
};

/** Заказы покупателя — сначала ближайшие будущие, потом прошедшие и отменённые (свежие сверху). */
export async function listCustomerOrders(email: string, db: Db = sharedDb): Promise<{ upcoming: AccountOrder[]; past: AccountOrder[] }> {
  const rows = await db
    .select({
      number: orders.number, status: orders.status, tourTitle: tours.title, startsAt: tourSessions.startsAt, children: orders.children,
      adults: orders.adults, total: orders.total, refundedAmount: orders.refundedAmount, accessToken: orders.accessToken,
    })
    .from(orders)
    .innerJoin(tourSessions, eq(orders.sessionId, tourSessions.id))
    .innerJoin(tours, eq(tourSessions.tourId, tours.id))
    .where(and(sql`lower(${orders.email}) = ${normalizeEmail(email)}`, inArray(orders.status, [...ACCOUNT_STATUSES]), isNotNull(orders.accessToken)))
    .orderBy(desc(tourSessions.startsAt), desc(orders.id));
  const list = rows.map((r) => ({ ...r, number: formatOrderNumber(r.number), accessToken: r.accessToken! })) as AccountOrder[];
  const now = Date.now();
  return {
    upcoming: list.filter((o) => o.status === "paid" && o.startsAt.getTime() > now).reverse(),
    past: list.filter((o) => !(o.status === "paid" && o.startsAt.getTime() > now)),
  };
}
