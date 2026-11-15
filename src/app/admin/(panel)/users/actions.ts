"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/viewer";
import { createAdminUser, updateAdminUser, type UserResult } from "@/server/admin-users";

export async function saveUserAction(id: number | null, input: unknown): Promise<UserResult> {
  const viewer = await requireAdmin();
  if (id !== null && !Number.isInteger(id)) return { ok: false, error: "Некорректный запрос", fieldErrors: {} };
  const r = id === null ? await createAdminUser(input) : await updateAdminUser(id, input, viewer);
  if (r.ok) {
    revalidatePath("/admin/users");
    revalidatePath(`/admin/users/${r.id}`);
  }
  return r;
}
