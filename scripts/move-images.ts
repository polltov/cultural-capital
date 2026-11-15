// Разовый перенос фото из Vercel Blob в объектное хранилище Селектела с заменой адресов в базе.
// На сервере (deploy/move-from-vercel.sh): docker compose run --rm tools npx tsx scripts/move-images.ts
import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const { db } = await import("../src/db/client");
  const { s3Config } = await import("../src/server/s3");
  const { moveVercelImages } = await import("../src/server/move-images");
  const cfg = s3Config();
  if (!cfg) throw new Error("Хранилище не настроено: задайте S3_* в окружении");
  const report = await moveVercelImages(db, cfg);
  console.log(`Фото перенесено: ${report.moved}`);
  for (const f of report.failed) console.error(`Не перенесено: ${f}`);
  process.exit(report.failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
