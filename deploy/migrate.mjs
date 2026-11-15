// Миграции базы из образа сайта — их применяет deploy.sh перед запуском новой версии:
//   docker compose run --rm --no-deps app node migrate.mjs
// Тот же мигратор drizzle-orm, что в интеграционных тестах, и та же таблица drizzle.__drizzle_migrations, что у
// drizzle-kit migrate: уже применённые миграции повторно не выполняются.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL не задан");
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
  console.log("миграции применены");
} finally {
  await sql.end();
}
