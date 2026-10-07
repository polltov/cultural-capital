import { eq } from "drizzle-orm";
import { db as sharedDb, type Db } from "@/db/client";
import { orders, tours, tourSessions } from "@/db/schema";
import { formatOrderNumber } from "@/lib/domain/order-number";
import { formatRub } from "@/lib/domain/pricing";
import { formatComposition } from "@/lib/domain/seats";
import { formatSessionLong } from "@/lib/domain/moscow-time";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function telegramConfig(): { token: string; chatId: string } | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn("Telegram не настроен: TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID не заданы");
    return null;
  }
  return { token, chatId };
}

/** Отправка в чат владельца; не бросает — ошибки только в лог. */
async function sendTelegram(cfg: { token: string; chatId: string }, text: string): Promise<void> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${cfg.token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: cfg.chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.error("Telegram sendMessage failed", res.status, await res.text());
  } catch (e) {
    console.error("Telegram notify error", e);
  }
}

type OrderRow = {
  number: string; tourTitle: string; startsAt: Date; children: number; adults: number; total: number;
  name: string; phone: string; adminUrl: string;
};

/** Загружает заказ и отправляет сообщение, собранное `compose`. Ссылка в админку без токена страницы заказа. */
async function notifyOrder(orderId: number, db: Db, compose: (o: OrderRow) => string): Promise<void> {
  const cfg = telegramConfig();
  if (!cfg) return;
  let text: string;
  try {
    const [row] = await db
      .select({ o: orders, title: tours.title, startsAt: tourSessions.startsAt })
      .from(orders)
      .innerJoin(tourSessions, eq(orders.sessionId, tourSessions.id))
      .innerJoin(tours, eq(tourSessions.tourId, tours.id))
      .where(eq(orders.id, orderId));
    if (!row) return;
    const site = process.env.SITE_URL || "http://localhost:3000";
    text = compose({
      number: formatOrderNumber(row.o.number), tourTitle: row.title, startsAt: row.startsAt,
      children: row.o.children, adults: row.o.adults, total: row.o.total, name: row.o.customerName,
      phone: row.o.phone, adminUrl: `${site}/admin/orders/${row.o.id}`,
    });
  } catch (e) {
    console.error("Telegram notify error", e);
    return;
  }
  await sendTelegram(cfg, text);
}

export function buildPaidOrderMessage(o: {
  number: string; tourTitle: string; startsAt: Date; children: number; adults: number; total: number;
  name: string; phone: string; adminUrl: string;
}): string {
  return [
    `<b>Оплачен заказ ${esc(o.number)} · ${formatRub(o.total)}</b>`,
    esc(o.tourTitle),
    formatSessionLong(o.startsAt),
    formatComposition(o.children, o.adults),
    `${esc(o.name)}, ${esc(o.phone)}`,
    esc(o.adminUrl),
  ].join("\n");
}

export function notifyPaidOrder(orderId: number, db: Db = sharedDb): Promise<void> {
  return notifyOrder(orderId, db, buildPaidOrderMessage);
}

/** Тревога владельцу: несовпадение суммы, поздняя оплата без мест. */
export async function notifyAlert(text: string): Promise<void> {
  const cfg = telegramConfig();
  if (cfg) await sendTelegram(cfg, `⚠️ ${esc(text)}`);
}
