"use server";

import { revalidatePath } from "next/cache";
import { revalidatePublicSite } from "@/server/revalidate";
import { requireAccess } from "@/lib/auth/viewer";
import { can } from "@/lib/auth/roles";
import { idSchema } from "@/lib/validation/tour";
import {
  deleteSession, reorderTours, saveSession, saveTour, saveTourContent, setTourPublished,
  type SaveSessionResult, type SaveTourResult, type SimpleResult,
} from "@/server/tours";
import { uploadImage, UploadError } from "@/server/upload";

function revalidateAll() {
  revalidatePublicSite();
  revalidatePath("/admin");
  revalidatePath("/admin/tours");
  revalidatePath("/admin/tours/[id]", "page");
}

const BAD: SimpleResult = { ok: false, error: "Некорректный запрос" };
const NEW_TOUR_ADMIN_ONLY = "Новую экскурсию добавляет администратор: у неё должны быть цены";

/** Без доступа к ценам (редактор) — только тексты, обложка и «главная»; цены и новые экскурсии — полный доступ. */
export async function saveTourAction(id: number | null, input: unknown): Promise<SaveTourResult> {
  const viewer = await requireAccess("content");
  if (id !== null && !idSchema.safeParse(id).success) return { ok: false, fieldErrors: { form: "Экскурсия не найдена" } };
  const pricing = can(viewer.role, "pricing");
  if (!pricing && id === null) return { ok: false, fieldErrors: { form: NEW_TOUR_ADMIN_ONLY } };
  const r = pricing ? await saveTour(input, id ?? undefined) : await saveTourContent(id!, input);
  if (r.ok) revalidateAll();
  return r;
}

export async function setPublishedAction(id: number, published: boolean): Promise<SimpleResult> {
  await requireAccess("content");
  if (typeof published !== "boolean") return BAD;
  const r = await setTourPublished(id, published);
  if (r.ok) revalidateAll();
  return r;
}

export async function reorderAction(ids: number[]): Promise<SimpleResult> {
  await requireAccess("content");
  const r = await reorderTours(ids);
  if (r.ok) revalidateAll();
  return r;
}

/** Сеансы (даты, лимиты, скрытие) — только полный доступ: от них зависят продажи и места. */
export async function saveSessionAction(input: unknown): Promise<SaveSessionResult> {
  await requireAccess("pricing");
  const r = await saveSession(input);
  if (r.ok) revalidateAll();
  return r;
}

export async function deleteSessionAction(id: number): Promise<SimpleResult> {
  await requireAccess("pricing");
  const r = await deleteSession(id);
  if (r.ok) revalidateAll();
  return r;
}

/** Обложки экскурсий и новостей. */
export async function uploadCoverAction(formData: FormData): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await requireAccess("content");
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Выберите файл" };
  try {
    return { ok: true, url: await uploadImage(file, formData.get("folder") === "news" ? "news" : "tours") };
  } catch (e) {
    if (e instanceof UploadError) return { ok: false, error: e.message };
    console.error("upload failed", e);
    return { ok: false, error: "Не удалось загрузить фото. Попробуйте ещё раз" };
  }
}
