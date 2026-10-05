import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { db as sharedDb, type Db } from "@/db/client";
import { orders, tours, tourSessions } from "@/db/schema";
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
