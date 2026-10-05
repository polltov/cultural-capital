import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { db as sharedDb, type Db } from "@/db/client";
import { orders, tours, tourSessions } from "@/db/schema";
import { freeSeats } from "@/lib/domain/seats";
import { seatsTakenSql } from "@/server/seats-sql";
import type { TicketTour } from "@/components/site/TicketCard";

export type CatalogTour = {
  tour: TicketTour & { id: number; slug: string };
  sessions: { id: number; startsAt: Date; free: number }[];
};

export async function getPublishedCatalog(db: Db = sharedDb): Promise<CatalogTour[]> {
  const rows = await db
    .select()
    .from(tours)
    .where(eq(tours.published, true))
    .orderBy(asc(tours.sortOrder), asc(tours.id));
  if (rows.length === 0) return [];

  const sessionRows = await db
    .select({
      id: tourSessions.id,
      tourId: tourSessions.tourId,
      startsAt: tourSessions.startsAt,
      capacity: tourSessions.capacity,
      occupied: seatsTakenSql(),
    })
    .from(tourSessions)
    .leftJoin(orders, eq(orders.sessionId, tourSessions.id))
    .where(
      and(
        inArray(tourSessions.tourId, rows.map((t) => t.id)),
        eq(tourSessions.hidden, false),
        gt(tourSessions.startsAt, new Date()),
      ),
    )
    .groupBy(tourSessions.id)
    .orderBy(asc(tourSessions.startsAt));

  return rows.map((t) => ({
    tour: {
      id: t.id,
      slug: t.slug,
      title: t.title,
      subtitle: t.subtitle,
      route: t.route,
      description: t.description,
      note: t.note,
      durationLabel: t.durationLabel,
      ageLabel: t.ageLabel,
      coverUrl: t.coverUrl,
      priceChild: t.priceChild,
      priceAdult: t.priceAdult,
      featured: t.featured,
    },
    sessions: sessionRows
      .filter((s) => s.tourId === t.id)
      .map((s) => ({ id: s.id, startsAt: s.startsAt, free: freeSeats(s.capacity, s.occupied) })),
  }));
}
