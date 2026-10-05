import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db as sharedDb, type Db } from "@/db/client";
import { news } from "@/db/schema";
import { slugify, uniqueSlug } from "@/lib/domain/slug";
import { idSchema } from "@/lib/validation/tour";
import { newsSchema } from "@/lib/validation/news";

export const NEWS_PAGE_SIZE = 12;

export type SaveNewsResult =
  | { ok: true; id: number; slug: string; oldSlug: string | null; published: boolean }
  | { ok: false; fieldErrors: Record<string, string> };
export type PublishResult = { ok: true; slug: string } | { ok: false; error: string };

const NOT_FOUND = "Новость не найдена";
const isUnique = (e: unknown) => (e as { cause?: { code?: string }; code?: string }).cause?.code === "23505" || (e as { code?: string }).code === "23505";

export async function saveNews(input: unknown, id?: number, db: Db = sharedDb): Promise<SaveNewsResult> {
  const parsed = newsSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0] ?? "form")] ??= i.message;
    return { ok: false, fieldErrors };
  }
  const { slug: manual, ...v } = parsed.data;
  const taken = async (s: string, exceptId?: number) =>
    (await db.select({ id: news.id }).from(news).where(eq(news.slug, s))).some((r) => r.id !== exceptId);

  if (id !== undefined) {
    if (!idSchema.safeParse(id).success) return { ok: false, fieldErrors: { form: NOT_FOUND } };
    const [cur] = await db.select({ slug: news.slug, publishedAt: news.publishedAt }).from(news).where(eq(news.id, id));
    if (!cur) return { ok: false, fieldErrors: { form: NOT_FOUND } };
    const slug = manual || cur.slug;
    if (slug !== cur.slug && (await taken(slug, id))) return { ok: false, fieldErrors: { slug: "Такой адрес уже занят" } };
    try {
      await db.update(news).set({ ...v, slug, updatedAt: new Date() }).where(eq(news.id, id));
    } catch (e) {
      if (isUnique(e)) return { ok: false, fieldErrors: { slug: "Такой адрес уже занят" } };
      throw e;
    }
    return { ok: true, id, slug, oldSlug: slug !== cur.slug ? cur.slug : null, published: cur.publishedAt !== null };
  }

  if (manual && (await taken(manual))) return { ok: false, fieldErrors: { slug: "Такой адрес уже занят" } };
  const base = manual || slugify(v.title) || "news";
  for (let attempt = 0; ; attempt++) {
    const slug = manual || (await uniqueSlug(base, (s) => taken(s)));
    try {
      const [row] = await db.insert(news).values({ ...v, slug, publishedAt: null }).returning({ id: news.id });
      return { ok: true, id: row.id, slug, oldSlug: null, published: false };
    } catch (e) {
      // гонка за slug: пробуем один раз ещё (для ручного — сообщаем об ошибке)
      if (isUnique(e)) {
        if (manual) return { ok: false, fieldErrors: { slug: "Такой адрес уже занят" } };
        if (attempt < 1) continue;
      }
      throw e;
    }
  }
}

export async function setNewsPublished(id: number, publish: boolean, db: Db = sharedDb): Promise<PublishResult> {
  if (!idSchema.safeParse(id).success) return { ok: false, error: NOT_FOUND };
  const publishedAt = publish ? sql`coalesce(${news.publishedAt}, now())` : null;
  const r = await db.update(news).set({ publishedAt, updatedAt: new Date() }).where(eq(news.id, id)).returning({ slug: news.slug });
  return r.length ? { ok: true, slug: r[0].slug } : { ok: false, error: NOT_FOUND };
}

const published = isNotNull(news.publishedAt);

export type NewsCard = { id: number; slug: string; title: string; excerpt: string; coverUrl: string | null; publishedAt: Date };
const cardCols = { id: news.id, slug: news.slug, title: news.title, excerpt: news.excerpt, coverUrl: news.coverUrl, publishedAt: news.publishedAt };

export async function getLatestNews(limit: number, db: Db = sharedDb): Promise<NewsCard[]> {
  const rows = await db.select(cardCols).from(news).where(published).orderBy(desc(news.publishedAt), desc(news.id)).limit(limit);
  return rows as NewsCard[];
}

export async function listPublishedNews(page: number, db: Db = sharedDb) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(news).where(published);
  const pages = Math.max(1, Math.ceil(n / NEWS_PAGE_SIZE));
  const p = Number.isInteger(page) && page >= 1 && page <= pages ? page : 1;
  const rows = await db
    .select(cardCols)
    .from(news)
    .where(published)
    .orderBy(desc(news.publishedAt), desc(news.id))
    .limit(NEWS_PAGE_SIZE)
    .offset((p - 1) * NEWS_PAGE_SIZE);
  return { items: rows as NewsCard[], page: p, pages, total: n };
}

export async function getNewsBySlug(slug: string, db: Db = sharedDb) {
  const [row] = await db.select().from(news).where(and(eq(news.slug, slug), published));
  return row ? { ...row, publishedAt: row.publishedAt as Date } : null;
}

export type AdminNewsRow = { id: number; slug: string; title: string; publishedAt: Date | null; updatedAt: Date };

export async function listAllNews(db: Db = sharedDb): Promise<AdminNewsRow[]> {
  return db
    .select({ id: news.id, slug: news.slug, title: news.title, publishedAt: news.publishedAt, updatedAt: news.updatedAt })
    .from(news)
    .orderBy(desc(news.updatedAt), desc(news.id));
}

export async function getAdminNews(id: number, db: Db = sharedDb) {
  if (!idSchema.safeParse(id).success) return null;
  const [row] = await db.select().from(news).where(eq(news.id, id));
  return row ?? null;
}
