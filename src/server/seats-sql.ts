import { inArray, sql } from "drizzle-orm";
import { orders } from "@/db/schema";
import { SEAT_HOLDING_STATUSES } from "@/lib/domain/seats";

/**
 * Aggregate: seats held by confirmed/done/paid orders and by awaiting_payment orders with an active hold
 * (hold_expires_at in the future) among the rows of `orders` in the current group.
 */
export function seatsTakenSql() {
  const holding = inArray(orders.status, [...SEAT_HOLDING_STATUSES]);
  return sql<number>`coalesce(sum(${orders.children} + ${orders.adults}) filter (where ${holding} or (${orders.status} = 'awaiting_payment' and ${orders.holdExpiresAt} > now())), 0)::int`;
}
