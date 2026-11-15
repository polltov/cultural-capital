import { cache } from "react";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db as sharedDb, type Db } from "@/db/client";
import { adminUsers } from "@/db/schema";
import type { Role } from "./roles";
import { ownerFingerprint, readSessionToken, SESSION_COOKIE, type SessionSubject } from "./session";

export type Viewer = { id: number | null; login: string; name: string; role: Role };

/**
 * Кто стоит за токеном — с проверкой по текущему состоянию: учётка владельца не менялась; сотрудник есть, не отключён,
 * и версия токена совпадает (смена пароля, роли или отключение её увеличивают).
 */
export async function resolveViewer(s: SessionSubject, db: Db = sharedDb): Promise<Viewer | null> {
  if (s.kind === "owner") {
    const fp = ownerFingerprint();
    if (!fp || s.v !== fp) return null;
    return { id: null, login: process.env.ADMIN_LOGIN!, name: "Владелец", role: "owner" };
  }
  const [u] = await db
    .select({ id: adminUsers.id, login: adminUsers.login, name: adminUsers.name, role: adminUsers.role, active: adminUsers.active, v: adminUsers.tokenVersion })
    .from(adminUsers)
    .where(eq(adminUsers.id, s.id));
  if (!u || !u.active || u.v !== s.v) return null;
  return { id: u.id, login: u.login, name: u.name, role: u.role };
}

/** Текущий вошедший (один раз на запрос); `null` — не вошёл или сессия больше не действует. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const s = token ? await readSessionToken(token) : null;
  return s ? resolveViewer(s) : null;
});

/** Любой сотрудник, включая гида: сводка сеансов, списки участников, отметка прихода. */
export async function requireStaff(): Promise<Viewer> {
  const v = await getViewer();
  if (!v) redirect("/admin/login");
  return v;
}

/**
 * Полный доступ (владелец и администраторы). Вызывать в каждой странице и в начале каждого Server Action админки,
 * кроме разрешённых гиду. Гида отправляет на сводку — её он видит.
 */
export async function requireAdmin(): Promise<Viewer> {
  const v = await requireStaff();
  if (v.role === "guide") redirect("/admin");
  return v;
}
