import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { faqItems, tours } from "@/db/schema";
import { idSchema } from "@/lib/validation/tour";

type Sortable = typeof tours | typeof faqItems;

/**
 * sortOrder = индекс в переданном списке; список должен быть перестановкой всех строк таблицы.
 * Строки блокируются FOR UPDATE в одной транзакции, поэтому параллельная правка не потеряется молча.
 */
export async function reorderRows(
  table: Sortable,
  ids: number[],
  changedMessage: string,
  db: Db,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Array.isArray(ids) || !ids.every((x) => idSchema.safeParse(x).success) || new Set(ids).size !== ids.length) {
    return { ok: false, error: "Некорректный порядок" };
  }
  return db.transaction(async (tx) => {
    const existing = await tx.select({ id: table.id }).from(table).for("update");
    const have = new Set(existing.map((r) => r.id));
    if (existing.length !== ids.length || !ids.every((x) => have.has(x))) {
      return { ok: false, error: changedMessage } as const;
    }
    const now = new Date();
    for (const [i, id] of ids.entries()) {
      await tx.update(table).set({ sortOrder: i, updatedAt: now }).where(eq(table.id, id));
    }
    return { ok: true } as const;
  });
}
