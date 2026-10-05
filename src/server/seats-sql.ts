import { sql } from "drizzle-orm";
import { orders } from "@/db/schema";
import { SEAT_HOLDING_STATUSES } from "@/lib/domain/seats";

/** Aggregate: seats held by confirmed/done orders among the rows of `orders` in the current group. */
export function seatsTakenSql() {
  return sql<number>`coalesce(sum(${orders.children} + ${orders.adults}) filter (where ${orders.status} in ${SEAT_HOLDING_STATUSES}), 0)::int`;
}
