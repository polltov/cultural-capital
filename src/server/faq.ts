import { asc, eq, sql } from "drizzle-orm";
import { db as sharedDb, type Db } from "@/db/client";
import { faqItems } from "@/db/schema";
import { faqSchema } from "@/lib/validation/faq";
import { idSchema } from "@/lib/validation/tour";
import { reorderRows } from "@/server/reorder";

export type FaqItem = { id: number; question: string; answer: string; sortOrder: number; published: boolean };
export type SaveFaqResult = { ok: true; id: number } | { ok: false; fieldErrors: Record<string, string>; error?: string };
export type FaqResult = { ok: true } | { ok: false; error: string };

const NOT_FOUND = "Вопрос не найден";
const inOrder = [asc(faqItems.sortOrder), asc(faqItems.id)] as const;
const itemCols = {
  id: faqItems.id, question: faqItems.question, answer: faqItems.answer, sortOrder: faqItems.sortOrder, published: faqItems.published,
};

/** Блок на сайте: только опубликованные, в порядке админки. */
export async function listPublishedFaq(db: Db = sharedDb): Promise<{ id: number; question: string; answer: string }[]> {
  return db
    .select({ id: faqItems.id, question: faqItems.question, answer: faqItems.answer })
    .from(faqItems)
    .where(eq(faqItems.published, true))
    .orderBy(...inOrder);
}

export async function listAllFaq(db: Db = sharedDb): Promise<FaqItem[]> {
  return db.select(itemCols).from(faqItems).orderBy(...inOrder);
}

export async function getFaqItem(id: number, db: Db = sharedDb): Promise<FaqItem | null> {
  if (!idSchema.safeParse(id).success) return null;
  const [row] = await db.select(itemCols).from(faqItems).where(eq(faqItems.id, id));
  return row ?? null;
}

export async function saveFaqItem(input: unknown, id?: number, db: Db = sharedDb): Promise<SaveFaqResult> {
  const parsed = faqSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0] ?? "form")] ??= i.message;
    return { ok: false, fieldErrors };
  }
  const v = parsed.data;

  if (id !== undefined) {
    if (!idSchema.safeParse(id).success) return { ok: false, fieldErrors: {}, error: NOT_FOUND };
    const updated = await db
      .update(faqItems)
      .set({ ...v, updatedAt: new Date() })
      .where(eq(faqItems.id, id))
      .returning({ id: faqItems.id });
    return updated.length ? { ok: true, id } : { ok: false, fieldErrors: {}, error: NOT_FOUND };
  }

  const [row] = await db
    .insert(faqItems)
    .values({
      ...v,
      published: true,
      sortOrder: sql`(select coalesce(max(${faqItems.sortOrder}), -1) + 1 from ${faqItems})`,
    })
    .returning({ id: faqItems.id });
  return { ok: true, id: row.id };
}

export async function setFaqPublished(id: number, published: boolean, db: Db = sharedDb): Promise<FaqResult> {
  if (!idSchema.safeParse(id).success) return { ok: false, error: NOT_FOUND };
  const r = await db.update(faqItems).set({ published, updatedAt: new Date() }).where(eq(faqItems.id, id)).returning({ id: faqItems.id });
  return r.length ? { ok: true } : { ok: false, error: NOT_FOUND };
}

export async function deleteFaqItem(id: number, db: Db = sharedDb): Promise<FaqResult> {
  if (!idSchema.safeParse(id).success) return { ok: false, error: NOT_FOUND };
  const r = await db.delete(faqItems).where(eq(faqItems.id, id)).returning({ id: faqItems.id });
  return r.length ? { ok: true } : { ok: false, error: NOT_FOUND };
}

/** sortOrder = индекс в переданном списке; список должен быть перестановкой всех вопросов (скрытые тоже). */
export async function reorderFaq(ids: number[], db: Db = sharedDb): Promise<FaqResult> {
  return reorderRows(faqItems, ids, "Список вопросов изменился — обновите страницу", db);
}
