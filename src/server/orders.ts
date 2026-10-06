import { eq, sql } from "drizzle-orm";
import { db as sharedDb, type Db, type Tx } from "@/db/client";
import { orders, tours, tourSessions } from "@/db/schema";
import { bookingSchema, type BookingResult } from "@/lib/validation/booking";
import { orderTotal } from "@/lib/domain/pricing";
import { formatOrderNumber } from "@/lib/domain/order-number";
import { canTransition, STATUS_LABELS, type OrderStatus } from "@/lib/domain/order-status";
import { hitRateLimit } from "@/server/rate-limit";
import { seatsTakenSql } from "@/server/seats-sql";

/** Seats held by confirmed/done/paid orders and active payment holds of a session. */
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

export type TransitionResult = { ok: true } | { ok: false; error: string };

/** Смена статуса. Блокировки в порядке сеанс → заявка (единый порядок, без взаимных дедлоков). */
export async function transitionOrder(id: number, to: OrderStatus, db: Db = sharedDb): Promise<TransitionResult> {
  return db.transaction(async (tx) => {
    const [ref] = await tx.select({ sessionId: orders.sessionId }).from(orders).where(eq(orders.id, id));
    if (!ref) return { ok: false, error: "Заявка не найдена" } as const;
    const [session] = await tx.execute<{ capacity: number }>(sql`select capacity from tour_sessions where id = ${ref.sessionId} for update`);
    const [o] = await tx.execute<{ status: OrderStatus; children: number; adults: number }>(
      sql`select status, children, adults from orders where id = ${id} for update`,
    );
    if (!o) return { ok: false, error: "Заявка не найдена" } as const;
    if (!canTransition(o.status, to)) {
      return { ok: false, error: `Нельзя перевести заявку из «${STATUS_LABELS[o.status]}» в «${STATUS_LABELS[to]}»` } as const;
    }
    if (to === "confirmed") {
      const n = o.children + o.adults;
      const free = session.capacity - (await occupiedSeats(tx, ref.sessionId));
      if (n > free) return { ok: false, error: `Свободно ${Math.max(free, 0)}, в заявке ${n} — увеличьте лимит или отмените` } as const;
    }
    await tx.update(orders).set({ status: to, updatedAt: new Date() }).where(eq(orders.id, id));
    return { ok: true } as const;
  });
}

export async function setAdminNote(id: number, note: string, db: Db = sharedDb): Promise<void> {
  await db.update(orders).set({ adminNote: note.slice(0, 2000), updatedAt: new Date() }).where(eq(orders.id, id));
}
