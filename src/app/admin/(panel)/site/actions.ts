"use server";

import { requireAccess } from "@/lib/auth/viewer";
import { isSiteSection, type SiteSection } from "@/lib/site-content";
import { revalidatePublicSite } from "@/server/revalidate";
import { saveSiteSection } from "@/server/site-content";

export async function saveSiteSectionAction<K extends SiteSection>(section: K, revision: number, input: unknown) {
  await requireAccess("content");
  if (!isSiteSection(section)) return { ok: false, error: "Блок не найден." } as const;

  const result = await saveSiteSection(section, revision, input);
  if (result.ok) revalidatePublicSite();
  return result;
}
