import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { putObject, type S3Config } from "./s3";

/**
 * Разовый переезд фото из Vercel Blob в объектное хранилище Селектела (scripts/move-images.ts): каждый файл
 * скачивается, кладётся в контейнер под тем же путём (`tours/…`, `news/…`), и его адрес заменяется во всех текстах
 * экскурсий, новостей и вопросов. Повторный запуск переносит только то, что не перенеслось.
 */

/** Где могут встречаться адреса фото: обложки и тексты в Markdown. Имена фиксированные, не из ввода. */
const COLUMNS: Record<string, string[]> = {
  tours: ["cover_url", "subtitle", "route", "description", "note", "meeting_point", "what_to_bring"],
  news: ["cover_url", "excerpt", "body"],
  faq_items: ["answer"],
};

const BLOB_URL = String.raw`https://[a-z0-9-]+\.public\.blob\.vercel-storage\.com/[^\s)"'<>\]]+`;

export type MoveReport = { moved: number; failed: string[] };

export async function moveVercelImages(db: Db, cfg: S3Config, fetchImpl: typeof fetch = fetch): Promise<MoveReport> {
  const urls = new Set<string>();
  for (const [table, cols] of Object.entries(COLUMNS)) {
    for (const col of cols) {
      const rows = await db.execute<{ url: string }>(
        sql.raw(`SELECT DISTINCT (regexp_matches(${col}, '${BLOB_URL.replace(/'/g, "''")}', 'gi'))[1] AS url FROM ${table}`),
      );
      for (const r of rows) urls.add(r.url);
    }
  }

  const report: MoveReport = { moved: 0, failed: [] };
  for (const from of urls) {
    try {
      const res = await fetchImpl(from, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`ответ ${res.status}`);
      const body = new Uint8Array(await res.arrayBuffer());
      const key = decodeURIComponent(new URL(from).pathname).replace(/^\/+/, "");
      const to = await putObject(cfg, key, body, {
        contentType: res.headers.get("content-type") || "application/octet-stream",
        cacheControl: "public, max-age=31536000, immutable",
      }, fetchImpl);
      await db.transaction(async (tx) => {
        for (const [table, cols] of Object.entries(COLUMNS)) {
          for (const col of cols) {
            await tx.execute(sql`UPDATE ${sql.identifier(table)} SET ${sql.identifier(col)} = replace(${sql.identifier(col)}, ${from}, ${to})
              WHERE strpos(${sql.identifier(col)}, ${from}) > 0`);
          }
        }
      });
      report.moved++;
    } catch (e) {
      report.failed.push(`${from}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return report;
}
