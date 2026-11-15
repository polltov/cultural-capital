"use server";

import { revalidatePath } from "next/cache";
import { revalidatePublicSite } from "@/server/revalidate";
import { requireAccess } from "@/lib/auth/viewer";
import { idSchema } from "@/lib/validation/tour";
import { saveNews, setNewsPublished, type PublishResult, type SaveNewsResult } from "@/server/news";

function revalidateNews(...slugs: (string | null)[]) {
  revalidatePublicSite();
  revalidatePath("/news");
  for (const s of new Set(slugs)) if (s) revalidatePath(`/news/${s}`);
  revalidatePath("/admin/news");
  revalidatePath("/admin/news/[id]", "page");
}

export async function saveNewsAction(id: number | null, input: unknown): Promise<SaveNewsResult> {
  await requireAccess("content");
  if (id !== null && !idSchema.safeParse(id).success) return { ok: false, fieldErrors: { form: "Новость не найдена" } };
  const r = await saveNews(input, id ?? undefined);
  if (r.ok) revalidateNews(r.slug, r.oldSlug);
  return r;
}

export async function setNewsPublishedAction(id: number, publish: boolean): Promise<PublishResult> {
  await requireAccess("content");
  if (typeof publish !== "boolean") return { ok: false, error: "Некорректный запрос" };
  const r = await setNewsPublished(id, publish);
  if (r.ok) revalidateNews(r.slug);
  return r;
}
