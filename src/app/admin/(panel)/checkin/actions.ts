"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { setCheckedIn } from "@/server/checkin";

/** Отметить приход / снять отметку — со страницы QR-кода и из списка участников сеанса. */
export async function toggleCheckin(orderId: number, on: boolean): Promise<void> {
  await requireAdmin();
  if (!Number.isInteger(orderId) || typeof on !== "boolean") return;
  await setCheckedIn(orderId, on);
  revalidatePath("/admin/sessions/[id]", "page");
  revalidatePath("/admin/checkin/[token]", "page");
}
