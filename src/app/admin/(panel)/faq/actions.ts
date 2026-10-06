"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { deleteFaqItem, reorderFaq, saveFaqItem, setFaqPublished, type FaqResult, type SaveFaqResult } from "@/server/faq";

function revalidateFaq(id?: number) {
  revalidatePath("/");
  revalidatePath("/admin/faq");
  if (id !== undefined) revalidatePath(`/admin/faq/${id}`);
}

const BAD: FaqResult = { ok: false, error: "Некорректный запрос" };

export async function saveFaqAction(id: number | null, input: unknown): Promise<SaveFaqResult> {
  await requireAdmin();
  const r = await saveFaqItem(input, id ?? undefined);
  if (r.ok) revalidateFaq(r.id);
  return r;
}

export async function setFaqPublishedAction(id: number, published: boolean): Promise<FaqResult> {
  await requireAdmin();
  if (typeof published !== "boolean") return BAD;
  const r = await setFaqPublished(id, published);
  if (r.ok) revalidateFaq();
  return r;
}

export async function reorderFaqAction(ids: number[]): Promise<FaqResult> {
  await requireAdmin();
  const r = await reorderFaq(ids);
  if (r.ok) revalidateFaq();
  return r;
}

export async function deleteFaqAction(id: number): Promise<FaqResult> {
  await requireAdmin();
  const r = await deleteFaqItem(id);
  if (r.ok) revalidateFaq();
  return r;
}
