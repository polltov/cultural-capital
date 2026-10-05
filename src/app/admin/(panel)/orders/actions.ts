"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/domain/order-status";
import { setAdminNote, transitionOrder, type TransitionResult } from "@/server/orders";

function revalidateAll(id: number) {
  revalidatePath("/admin/sessions/[id]", "page");
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${id}`);
}

export async function changeStatus(id: number, to: OrderStatus): Promise<TransitionResult> {
  await requireAdmin();
  if (!Number.isInteger(id) || !ORDER_STATUSES.includes(to)) return { ok: false, error: "Некорректный запрос" };
  const r = await transitionOrder(id, to);
  if (r.ok) revalidateAll(id);
  return r;
}

export async function saveNote(id: number, formData: FormData): Promise<void> {
  await requireAdmin();
  if (!Number.isInteger(id)) return;
  await setAdminNote(id, String(formData.get("note") ?? ""));
  revalidateAll(id);
}
