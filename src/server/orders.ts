import { eq } from "drizzle-orm";
import { db as sharedDb, type Db, type Tx } from "@/db/client";
import { orders, tours, tourSessions } from "@/db/schema";
import { bookingSchema, type BookingResult } from "@/lib/validation/booking";
import { orderTotal } from "@/lib/domain/pricing";
import { formatOrderNumber } from "@/lib/domain/order-number";
import { hitRateLimit } from "@/server/rate-limit";
import { seatsTakenSql } from "@/server/seats-sql";

/** Seats held by confirmed/done orders of a session. */
export async function occupiedSeats(db: Db | Tx, sessionId: number): Promise<number> {
  const [r] = await db
    .select({ n: seatsTakenSql() })
    .from(orders)
    .where(eq(orders.sessionId, sessionId));
  return r.n;
}

export async function createOrder(input: unknown, ip: string, db: Db = sharedDb): Promise<BookingResult> {
  const parsed = bookingSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<string, string>> = {};
    for (const i of parsed.error.issues) {
      const k = String(i.path[0] ?? "form");
      fieldErrors[k] ??= i.message;
    }
    return { ok: false, fieldErrors };
  }
  const v = parsed.data;
  if (v.website) return { ok: false };

  if (!(await hitRateLimit(`order:${ip}`, 5, 3600, db))) {
    return { ok: false, error: "Слишком много заявок. Попробуйте позже или позвоните нам." };
  }

  const [s] = await db
    .select({
      id: tourSessions.id, startsAt: tourSessions.startsAt, capacity: tourSessions.capacity, hidden: tourSessions.hidden,
      published: tours.published, priceChild: tours.priceChild, priceAdult: tours.priceAdult,
    })
    .from(tourSessions)
    .innerJoin(tours, eq(tourSessions.tourId, tours.id))
    .where(eq(tourSessions.id, v.sessionId));
  if (!s || s.hidden || !s.published || s.startsAt.getTime() <= Date.now()) {
    return { ok: false, error: "Этот сеанс недоступен для записи" };
  }
  const free = s.capacity - (await occupiedSeats(db, s.id));
  if (v.children + v.adults > free) {
    return { ok: false, error: free > 0 ? `Осталось мест: ${free}` : "Мест не осталось" };
  }

  const [o] = await db
    .insert(orders)
    .values({
      sessionId: s.id, customerName: v.name, phone: v.phone, email: v.email || null, comment: v.comment ?? "",
      children: v.children, adults: v.adults, priceChildSnapshot: s.priceChild, priceAdultSnapshot: s.priceAdult,
      total: orderTotal({ children: v.children, adults: v.adults, priceChild: s.priceChild, priceAdult: s.priceAdult }),
      consentAt: new Date(),
    })
    .returning({ id: orders.id, number: orders.number });
  return { ok: true, orderId: o.id, number: formatOrderNumber(o.number) };
}
