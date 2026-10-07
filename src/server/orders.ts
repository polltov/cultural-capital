import { eq, sql } from "drizzle-orm";
import { db as sharedDb, type Db, type Tx } from "@/db/client";
import { orders } from "@/db/schema";
import { canTransition, STATUS_LABELS, type OrderStatus } from "@/lib/domain/order-status";
import { seatsTakenSql } from "@/server/seats-sql";

/** Seats held by confirmed/done/paid orders and active payment holds of a session. */
export async function occupiedSeats(db: Db | Tx, sessionId: number): Promise<number> {
  const [r] = await db
    .select({ n: seatsTakenSql() })
    .from(orders)
    .where(eq(orders.sessionId, sessionId));
  return r.n;
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
