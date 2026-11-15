import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { orders } from "@/db/schema";
import { checkinUrl, ORDER_TOKEN } from "@/lib/checkin";
import { VALID_TICKET_STATUSES } from "@/server/checkin";
import { qrPng } from "@/server/qr";

export const dynamic = "force-dynamic";

const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

/**
 * PNG QR-кода билета для писем. Только для действующего билета: у отменённого заказа картинка в старом письме пропадает.
 * Ссылка секретная (токен заказа), поэтому кэш только в браузере и без индексации.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await params;
  if (!ORDER_TOKEN.test(token)) return notFound();
  const [o] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.accessToken, token), inArray(orders.status, [...VALID_TICKET_STATUSES])));
  if (!o) return notFound();
  const png = await qrPng(checkinUrl(token));
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=3600", "X-Robots-Tag": "noindex" },
  });
}
