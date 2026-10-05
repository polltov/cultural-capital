import { and, asc, desc, eq, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import { db as sharedDb, type Db } from "@/db/client";
import { orders, tours, tourSessions } from "@/db/schema";
import type { OrderStatus } from "@/lib/domain/order-status";
import { seatsTakenSql } from "@/server/seats-sql";

const UPCOMING_DAYS = 14;

export type DashboardSession = { sessionId: number; tourTitle: string; startsAt: Date; capacity: number; taken: number };
export type Dashboard = { newOrders: number; upcoming: DashboardSession[] };

export async function countNewOrders(db: Db = sharedDb): Promise<number> {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(orders).where(eq(orders.status, "new"));
  return n;
}

export async function getDashboard(db: Db = sharedDb): Promise<Dashboard> {
  const now = new Date();
  const until = new Date(now.getTime() + UPCOMING_DAYS * 24 * 3600_000);

  const [newOrders, upcoming] = await Promise.all([
    countNewOrders(db),
    db
      .select({
        sessionId: tourSessions.id,
        tourTitle: tours.title,
        startsAt: tourSessions.startsAt,
        capacity: tourSessions.capacity,
        taken: seatsTakenSql(),
      })
      .from(tourSessions)
      .innerJoin(tours, eq(tourSessions.tourId, tours.id))
      .leftJoin(orders, eq(orders.sessionId, tourSessions.id))
      .where(and(eq(tourSessions.hidden, false), gte(tourSessions.startsAt, now), lte(tourSessions.startsAt, until)))
      .groupBy(tourSessions.id, tours.title)
      .orderBy(asc(tourSessions.startsAt), asc(tourSessions.id)),
  ]);
  return { newOrders, upcoming };
}

export const ORDERS_PAGE_SIZE = 30;

export type OrderFilters = { status?: OrderStatus | "all"; tourId?: number; sessionId?: number; q?: string; page?: number };
export type OrderRow = {
  id: number; number: number; createdAt: Date; status: OrderStatus; customerName: string; phone: string;
  children: number; adults: number; total: number; sessionId: number; startsAt: Date; tourId: number; tourTitle: string;
};
export type OrderDetail = OrderRow & {
  email: string | null; comment: string; adminNote: string; priceChildSnapshot: number; priceAdultSnapshot: number; updatedAt: Date;
};

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function listOrders(f: OrderFilters, db: Db = sharedDb): Promise<{ rows: OrderRow[]; total: number }> {
  const conds: SQL[] = [];
  if (f.status && f.status !== "all") conds.push(eq(orders.status, f.status));
  if (f.tourId) conds.push(eq(tourSessions.tourId, f.tourId));
  if (f.sessionId) conds.push(eq(orders.sessionId, f.sessionId));
  const q = f.q?.trim();
  if (q) {
    const digits = q.replace(/\D/g, "");
    const alts: SQL[] = [ilike(orders.customerName, `%${escapeLike(q)}%`)];
    if (digits.length >= 3) alts.push(sql`${orders.phone} like ${`%${digits}%`}`);
    conds.push(or(...alts)!);
  }
  const where = conds.length ? and(...conds) : undefined;
  const page = Math.max(1, Math.floor(f.page ?? 1));

  const [rows, [{ n }]] = await Promise.all([
    db
      .select({
        id: orders.id, number: orders.number, createdAt: orders.createdAt, status: orders.status,
        customerName: orders.customerName, phone: orders.phone, children: orders.children, adults: orders.adults,
        total: orders.total, sessionId: orders.sessionId, startsAt: tourSessions.startsAt,
        tourId: tourSessions.tourId, tourTitle: tours.title,
      })
      .from(orders)
      .innerJoin(tourSessions, eq(orders.sessionId, tourSessions.id))
      .innerJoin(tours, eq(tourSessions.tourId, tours.id))
      .where(where)
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(ORDERS_PAGE_SIZE)
      .offset((page - 1) * ORDERS_PAGE_SIZE),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(orders)
      .innerJoin(tourSessions, eq(orders.sessionId, tourSessions.id))
      .where(where),
  ]);
  return { rows, total: n };
}

export async function getOrder(id: number, db: Db = sharedDb): Promise<OrderDetail | null> {
  const [r] = await db
    .select({
      id: orders.id, number: orders.number, createdAt: orders.createdAt, updatedAt: orders.updatedAt, status: orders.status,
      customerName: orders.customerName, phone: orders.phone, email: orders.email, comment: orders.comment,
      adminNote: orders.adminNote, children: orders.children, adults: orders.adults, total: orders.total,
      priceChildSnapshot: orders.priceChildSnapshot, priceAdultSnapshot: orders.priceAdultSnapshot,
      sessionId: orders.sessionId, startsAt: tourSessions.startsAt, tourId: tourSessions.tourId, tourTitle: tours.title,
    })
    .from(orders)
    .innerJoin(tourSessions, eq(orders.sessionId, tourSessions.id))
    .innerJoin(tours, eq(tourSessions.tourId, tours.id))
    .where(eq(orders.id, id));
  return r ?? null;
}
