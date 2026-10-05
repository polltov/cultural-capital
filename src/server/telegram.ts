import { eq } from "drizzle-orm";
import { db as sharedDb, type Db } from "@/db/client";
import { orders, tours, tourSessions } from "@/db/schema";
import { formatOrderNumber } from "@/lib/domain/order-number";
import { formatRub } from "@/lib/domain/pricing";
import { pluralRu } from "@/lib/domain/seats";
import { formatSessionLong } from "@/lib/domain/moscow-time";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function buildOrderMessage(o: {
  number: string; tourTitle: string; startsAt: Date; children: number; adults: number; total: number;
  name: string; phone: string; comment: string | null; adminUrl: string;
}): string {
  const parts: string[] = [];
  if (o.children > 0) parts.push(`${o.children} ${pluralRu(o.children, ["детский", "детских", "детских"])}`);
  if (o.adults > 0) parts.push(`${o.adults} ${pluralRu(o.adults, ["взрослый", "взрослых", "взрослых"])}`);
  const lines = [
    `<b>Новая заявка ${esc(o.number)}</b>`,
    esc(o.tourTitle),
    formatSessionLong(o.startsAt),
    `${parts.join(" + ")} — ${formatRub(o.total)}`,
    `${esc(o.name)}, ${esc(o.phone)}`,
  ];
  if (o.comment) lines.push(`Комментарий: ${esc(o.comment)}`);
  lines.push(esc(o.adminUrl));
  return lines.join("\n");
}

export async function notifyNewOrder(orderId: number, db: Db = sharedDb): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn("Telegram не настроен: TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID не заданы");
    return;
  }
  try {
    const [row] = await db
      .select({ o: orders, title: tours.title, startsAt: tourSessions.startsAt })
      .from(orders)
      .innerJoin(tourSessions, eq(orders.sessionId, tourSessions.id))
      .innerJoin(tours, eq(tourSessions.tourId, tours.id))
      .where(eq(orders.id, orderId));
    if (!row) return;
    const site = process.env.SITE_URL || "http://localhost:3000";
    const text = buildOrderMessage({
      number: formatOrderNumber(row.o.number), tourTitle: row.title, startsAt: row.startsAt,
      children: row.o.children, adults: row.o.adults, total: row.o.total, name: row.o.customerName,
      phone: row.o.phone, comment: row.o.comment || null, adminUrl: `${site}/admin/orders/${row.o.id}`,
    });
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
    if (!res.ok) console.error("Telegram sendMessage failed", res.status, await res.text());
  } catch (e) {
    console.error("Telegram notify error", e);
  }
}
