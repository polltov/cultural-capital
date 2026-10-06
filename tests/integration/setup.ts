import { beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from "@/db/client";

let migrated: Promise<void> | undefined;

beforeEach(async () => {
  migrated ??= migrate(db, { migrationsFolder: "./drizzle" });
  await migrated;
  await db.execute(
    sql`TRUNCATE tours, tour_sessions, orders, payment_events, news, faq_items, rate_limit_hits RESTART IDENTITY CASCADE`,
  );
});
