import { asc, eq, sql } from "drizzle-orm";
import { db as sharedDb, type Db } from "@/db/client";
import { orders, tours, tourSessions } from "@/db/schema";
import { slugify, uniqueSlug } from "@/lib/domain/slug";
import { parseMoscowLocal } from "@/lib/domain/moscow-time";
import { idSchema, sessionSchema, tourSchema } from "@/lib/validation/tour";
import { occupiedSeats } from "@/server/orders";
import { reorderRows } from "@/server/reorder";
import { seatsTakenSql } from "@/server/seats-sql";

export type SaveTourResult = { ok: true; id: number } | { ok: false; fieldErrors: Record<string, string> };
export type SimpleResult = { ok: true } | { ok: false; error: string };
export type SaveSessionResult = { ok: true; id: number } | { ok: false; error: string };

export async function saveTour(input: unknown, id?: number, db: Db = sharedDb): Promise<SaveTourResult> {
  const parsed = tourSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0] ?? "form")] ??= i.message;
    return { ok: false, fieldErrors };
  }
  const v = parsed.data;

  if (id !== undefined) {
    if (!idSchema.safeParse(id).success) return { ok: false, fieldErrors: { form: "Экскурсия не найдена" } };
    const updated = await db
      .update(tours)
      .set({ ...v, updatedAt: new Date() })
      .where(eq(tours.id, id))
      .returning({ id: tours.id });
    if (updated.length === 0) return { ok: false, fieldErrors: { form: "Экскурсия не найдена" } };
    return { ok: true, id };
  }

  const base = slugify(v.title) || "tour";
  for (let attempt = 0; ; attempt++) {
    const slug = await uniqueSlug(base, async (s) => (await db.select({ id: tours.id }).from(tours).where(eq(tours.slug, s))).length > 0);
    try {
      const [row] = await db
        .insert(tours)
        .values({
          ...v,
          slug,
          published: false,
          sortOrder: sql`(select coalesce(max(${tours.sortOrder}), -1) + 1 from ${tours})`,
        })
        .returning({ id: tours.id });
      return { ok: true, id: row.id };
    } catch (e) {
      // гонка за slug: уникальный индекс — пробуем ещё раз
      if (attempt < 3 && (e as { code?: string; cause?: { code?: string } }).cause?.code === "23505") continue;
      throw e;
    }
  }
}

export async function setTourPublished(id: number, published: boolean, db: Db = sharedDb): Promise<SimpleResult> {
  if (!idSchema.safeParse(id).success) return { ok: false, error: "Экскурсия не найдена" };
  const r = await db.update(tours).set({ published, updatedAt: new Date() }).where(eq(tours.id, id)).returning({ id: tours.id });
  return r.length ? { ok: true } : { ok: false, error: "Экскурсия не найдена" };
}

/** sortOrder = индекс в переданном списке; список должен быть перестановкой всех экскурсий. */
export async function reorderTours(ids: number[], db: Db = sharedDb): Promise<SimpleResult> {
  return reorderRows(tours, ids, "Список экскурсий изменился — обновите страницу", db);
}

export async function saveSession(input: unknown, db: Db = sharedDb): Promise<SaveSessionResult> {
  const parsed = sessionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Проверьте данные сеанса" };
  const v = parsed.data;
  const startsAt = parseMoscowLocal(v.startsAt);

  return db.transaction(async (tx) => {
    const [tour] = await tx.select({ id: tours.id }).from(tours).where(eq(tours.id, v.tourId));
    if (!tour) return { ok: false, error: "Экскурсия не найдена" } as const;

    if (v.id === undefined) {
      const [row] = await tx
        .insert(tourSessions)
        .values({ tourId: v.tourId, startsAt, capacity: v.capacity, hidden: v.hidden })
        .returning({ id: tourSessions.id });
      return { ok: true, id: row.id } as const;
    }

    // Блокируем сеанс и считаем места в одной транзакции: параллельное подтверждение (transitionOrder) ждёт нас.
    const [s] = await tx.execute<{ tour_id: number }>(sql`select tour_id from tour_sessions where id = ${v.id} for update`);
    if (!s || s.tour_id !== v.tourId) return { ok: false, error: "Сеанс не найден" } as const;
    const taken = await occupiedSeats(tx, v.id);
    if (v.capacity < taken) {
      return { ok: false, error: `Уже подтверждено ${taken} человек — лимит не может быть меньше` } as const;
    }
    await tx.update(tourSessions).set({ startsAt, capacity: v.capacity, hidden: v.hidden }).where(eq(tourSessions.id, v.id));
    return { ok: true, id: v.id } as const;
  });
}

export async function deleteSession(id: number, db: Db = sharedDb): Promise<SimpleResult> {
  if (!idSchema.safeParse(id).success) return { ok: false, error: "Сеанс не найден" };
  return db.transaction(async (tx) => {
    const [s] = await tx.execute<{ id: number }>(sql`select id from tour_sessions where id = ${id} for update`);
    if (!s) return { ok: false, error: "Сеанс не найден" } as const;
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(orders).where(eq(orders.sessionId, id));
    if (n > 0) return { ok: false, error: "На сеанс есть заявки — его можно только скрыть" } as const;
    await tx.delete(tourSessions).where(eq(tourSessions.id, id));
    return { ok: true } as const;
  });
}

export type AdminTourRow = {
  id: number; title: string; coverUrl: string | null; published: boolean; sortOrder: number;
  nextSession: Date | null;
};

export async function listAdminTours(db: Db = sharedDb): Promise<AdminTourRow[]> {
  return db
    .select({
      id: tours.id, title: tours.title, coverUrl: tours.coverUrl, published: tours.published, sortOrder: tours.sortOrder,
      nextSession: sql<Date | null>`(select min(s.starts_at) from tour_sessions s where s.tour_id = ${tours.id} and s.hidden = false and s.starts_at > now())`.mapWith(
        (v) => (v ? new Date(v) : null),
      ),
    })
    .from(tours)
    .orderBy(asc(tours.sortOrder), asc(tours.id));
}

export type AdminSessionRow = { id: number; startsAt: Date; capacity: number; hidden: boolean; taken: number; orders: number };

export async function getAdminTour(id: number, db: Db = sharedDb) {
  if (!idSchema.safeParse(id).success) return null;
  const [tour] = await db.select().from(tours).where(eq(tours.id, id));
  if (!tour) return null;
  const sessions: AdminSessionRow[] = await db
    .select({
      id: tourSessions.id, startsAt: tourSessions.startsAt, capacity: tourSessions.capacity, hidden: tourSessions.hidden,
      taken: seatsTakenSql(), orders: sql<number>`count(${orders.id})::int`,
    })
    .from(tourSessions)
    .leftJoin(orders, eq(orders.sessionId, tourSessions.id))
    .where(eq(tourSessions.tourId, id))
    .groupBy(tourSessions.id)
    .orderBy(asc(tourSessions.startsAt), asc(tourSessions.id));
  return { tour, sessions };
}
