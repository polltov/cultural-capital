import bcrypt from "bcryptjs";
import { asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db as sharedDb, type Db } from "@/db/client";
import { adminUsers } from "@/db/schema";
import type { Viewer } from "@/lib/auth/viewer";

export type AdminUserRow = {
  id: number; login: string; name: string; role: "admin" | "guide"; active: boolean; lastLoginAt: Date | null; createdAt: Date;
};

export type UserResult = { ok: true; id: number } | { ok: false; error?: string; fieldErrors: Record<string, string> };

const BCRYPT_COST = 12;
const PASSWORD_MIN = 10;

const loginSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,40}$/, "От 3 до 40 символов: латинские буквы, цифры, точка, дефис, подчёркивание");
const nameSchema = z.string().trim().min(1, "Укажите имя").max(80, "Не длиннее 80 символов");
const roleSchema = z.enum(["admin", "guide"], { message: "Выберите роль" });
const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `Не короче ${PASSWORD_MIN} символов`)
  .max(200, "Не длиннее 200 символов");

const createSchema = z.object({ login: loginSchema, name: nameSchema, role: roleSchema, password: passwordSchema });
const updateSchema = z.object({
  name: nameSchema,
  role: roleSchema,
  active: z.boolean(),
  /** Пусто — пароль не меняется. */
  password: z.union([z.literal(""), passwordSchema]),
});

function fieldErrors(e: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of e.issues) {
    const k = String(i.path[0] ?? "form");
    out[k] ??= i.message;
  }
  return out;
}

export async function listAdminUsers(db: Db = sharedDb): Promise<AdminUserRow[]> {
  return db
    .select({
      id: adminUsers.id, login: adminUsers.login, name: adminUsers.name, role: adminUsers.role, active: adminUsers.active,
      lastLoginAt: adminUsers.lastLoginAt, createdAt: adminUsers.createdAt,
    })
    .from(adminUsers)
    .orderBy(desc(adminUsers.active), asc(adminUsers.name), asc(adminUsers.id));
}

export async function getAdminUser(id: number, db: Db = sharedDb): Promise<AdminUserRow | null> {
  if (!Number.isInteger(id) || id < 1 || id > 2_147_483_647) return null;
  const [r] = await db
    .select({
      id: adminUsers.id, login: adminUsers.login, name: adminUsers.name, role: adminUsers.role, active: adminUsers.active,
      lastLoginAt: adminUsers.lastLoginAt, createdAt: adminUsers.createdAt,
    })
    .from(adminUsers)
    .where(eq(adminUsers.id, id));
  return r ?? null;
}

/** Новый сотрудник. Логин владельца занять нельзя: при входе он всегда означал бы владельца. */
export async function createAdminUser(input: unknown, deps: { db?: Db; cost?: number } = {}): Promise<UserResult> {
  const db = deps.db ?? sharedDb;
  const p = createSchema.safeParse(input);
  if (!p.success) return { ok: false, fieldErrors: fieldErrors(p.error) };
  const { login, name, role, password } = p.data;
  const owner = (process.env.ADMIN_LOGIN ?? "").trim().toLowerCase();
  if (owner && login === owner) return { ok: false, fieldErrors: { login: "Этот логин занят" } };

  const passwordHash = await bcrypt.hash(password, deps.cost ?? BCRYPT_COST);
  const [r] = await db
    .insert(adminUsers)
    .values({ login, name, role, passwordHash })
    .onConflictDoNothing({ target: adminUsers.login })
    .returning({ id: adminUsers.id });
  if (!r) return { ok: false, fieldErrors: { login: "Этот логин занят" } };
  return { ok: true, id: r.id };
}

/**
 * Правка сотрудника. Смена пароля, роли или отключение увеличивают версию токена — сотрудника выкидывает из админки на всех
 * устройствах. Себе нельзя сменить роль и нельзя себя отключить: так не потерять доступ по ошибке.
 */
export async function updateAdminUser(
  id: number,
  input: unknown,
  actor: Pick<Viewer, "id">,
  deps: { db?: Db; cost?: number } = {},
): Promise<UserResult> {
  const db = deps.db ?? sharedDb;
  const p = updateSchema.safeParse(input);
  if (!p.success) return { ok: false, fieldErrors: fieldErrors(p.error) };
  const { name, role, active, password } = p.data;

  const current = await getAdminUser(id, db);
  if (!current) return { ok: false, error: "Сотрудник не найден", fieldErrors: {} };
  if (actor.id === id && (role !== current.role || !active)) {
    return { ok: false, error: "Себе нельзя сменить роль или отключить вход — попросите другого администратора", fieldErrors: {} };
  }

  const revoke = role !== current.role || active !== current.active || password !== "";
  const passwordHash = password ? await bcrypt.hash(password, deps.cost ?? BCRYPT_COST) : undefined;
  await db
    .update(adminUsers)
    .set({
      name, role, active, updatedAt: new Date(),
      ...(passwordHash ? { passwordHash } : {}),
      ...(revoke ? { tokenVersion: sql`${adminUsers.tokenVersion} + 1` } : {}),
    })
    .where(eq(adminUsers.id, id));
  return { ok: true, id };
}
