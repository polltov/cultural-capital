"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { idSchema } from "@/lib/validation/tour";
import {
  deleteSession, reorderTours, saveSession, saveTour, setTourPublished,
  type SaveSessionResult, type SaveTourResult, type SimpleResult,
} from "@/server/tours";
import { uploadImage, UploadError } from "@/server/upload";

function revalidateAll() {
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/tours");
  revalidatePath("/admin/tours/[id]", "page");
}

const BAD: SimpleResult = { ok: false, error: "Некорректный запрос" };

export async function saveTourAction(id: number | null, input: unknown): Promise<SaveTourResult> {
  await requireAdmin();
  if (id !== null && !idSchema.safeParse(id).success) return { ok: false, fieldErrors: { form: "Экскурсия не найдена" } };
  const r = await saveTour(input, id ?? undefined);
  if (r.ok) revalidateAll();
  return r;
}

export async function setPublishedAction(id: number, published: boolean): Promise<SimpleResult> {
  await requireAdmin();
  if (typeof published !== "boolean") return BAD;
  const r = await setTourPublished(id, published);
  if (r.ok) revalidateAll();
  return r;
}

export async function reorderAction(ids: number[]): Promise<SimpleResult> {
  await requireAdmin();
  const r = await reorderTours(ids);
  if (r.ok) revalidateAll();
  return r;
}

export async function saveSessionAction(input: unknown): Promise<SaveSessionResult> {
  await requireAdmin();
  const r = await saveSession(input);
  if (r.ok) revalidateAll();
  return r;
}

export async function deleteSessionAction(id: number): Promise<SimpleResult> {
  await requireAdmin();
  const r = await deleteSession(id);
  if (r.ok) revalidateAll();
  return r;
}

export async function uploadCoverAction(formData: FormData): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Выберите файл" };
  try {
    return { ok: true, url: await uploadImage(file, "tours") };
  } catch (e) {
    if (e instanceof UploadError) return { ok: false, error: e.message };
    console.error("upload failed", e);
    return { ok: false, error: "Не удалось загрузить фото. Попробуйте ещё раз" };
  }
}
