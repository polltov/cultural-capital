import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const { db } = await import("../src/db/client");
  const { seed } = await import("../src/db/seed");
  const { tours } = await import("../src/db/schema");
  if (!process.argv.includes("--force")) {
    const existing = await db.select({ id: tours.id }).from(tours).limit(1);
    if (existing.length > 0) {
      console.error("В таблице tours уже есть данные — сид не выполнен, чтобы не перезаписать правки из админки. Для запуска всё равно: npm run db:seed -- --force");
      process.exit(1);
    }
  }
  await seed(db);
  console.log("Сид выполнен");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
