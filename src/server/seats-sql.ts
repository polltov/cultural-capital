import { sql } from "drizzle-orm";
import { orders } from "@/db/schema";
import { SEAT_HOLDING_STATUSES } from "@/lib/domain/seats";

/** Aggregate: seats held by confirmed/done/paid orders among the rows of `orders` in the current group. */
export function seatsTakenSql() {
  // ::text — до задачи 4 enum order_status в БД не знает "paid", и Postgres отвергает такой литерал
  return sql<number>`coalesce(sum(${orders.children} + ${orders.adults}) filter (where ${orders.status}::text in ${SEAT_HOLDING_STATUSES}), 0)::int`;
}
