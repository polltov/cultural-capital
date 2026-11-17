import { cache } from "react";
import { and, eq } from "drizzle-orm";
import { db as sharedDb, type Db } from "@/db/client";
import { siteContent } from "@/db/schema";
import { defaultSiteContent, isSiteSection, type SiteSection } from "@/lib/site-content";
import { parseSiteSection } from "@/lib/validation/site-content";

export async function readSiteContent(db: Db = sharedDb) {
  const content = { ...defaultSiteContent };
  const revisions: Partial<Record<SiteSection, number>> = {};
  if (db === sharedDb && !process.env.DATABASE_URL) return { content, revisions };

  function apply<K extends SiteSection>(section: K, saved: unknown) {
    content[section] = parseSiteSection(section, saved) ?? defaultSiteContent[section];
  }

  const rows = await db.select().from(siteContent);
  for (const row of rows) {
    if (!isSiteSection(row.section)) continue;
    apply(row.section, row.content);
    revisions[row.section] = row.revision;
  }

  return { content, revisions };
}

export const getSiteContent = cache(readSiteContent);

export async function saveSiteSection<K extends SiteSection>(section: K, revision: number, input: unknown, db: Db = sharedDb) {
  if (!Number.isInteger(revision) || revision < 0 || revision >= 2_147_483_647) {
    return { ok: false, error: "Откройте раздел заново и повторите сохранение." } as const;
  }
  const content = parseSiteSection(section, input);
  if (!content) return { ok: false, error: "Проверьте формат полей и заполните названия и тексты в списках." } as const;

  const next = { section, content, revision: revision + 1 };
  const [saved] = revision === 0
    ? await db.insert(siteContent).values(next).onConflictDoNothing().returning({ revision: siteContent.revision })
    : await db.update(siteContent).set({ content, revision: next.revision })
      .where(and(eq(siteContent.section, section), eq(siteContent.revision, revision)))
      .returning({ revision: siteContent.revision });

  return saved
    ? { ok: true, revision: saved.revision, content } as const
    : { ok: false, error: "Этот блок уже изменили в другой вкладке. Скопируйте свои правки и обновите страницу." } as const;
}
