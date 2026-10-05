import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const { db } = await import("../src/db/client");
  const { seed } = await import("../src/db/seed");
  await seed(db);
  console.log("Сид выполнен");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
