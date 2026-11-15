import { eq, sql } from "drizzle-orm";
import { db as sharedDb, type Db, type Tx } from "@/db/client";
import { adminUsers } from "@/db/schema";
import { checkPassword, isOwnerLogin, ownerFingerprint, signSession, verifyCredentials, type SessionSubject } from "@/lib/auth/session";
import { clearRateLimit, countRateLimit, recordRateLimit } from "@/server/rate-limit";

export const LOGIN_ERROR = "Неверный логин или пароль";
export const LOGIN_BLOCKED = "Слишком много попыток. Подождите 15 минут.";
const MAX_FAILURES = 5;
const WINDOW_SEC = 15 * 60;

export type LoginResult = { ok: true; token: string } | { ok: false; error: string };

/**
 * Счётчик проверяется до сверки пароля: после 5 неудач блокируется даже верный пароль.
 * Хит записывается только при неудаче; успех очищает счётчик IP.
 * count → verify → record выполняются в одной транзакции под pg_advisory_xact_lock по ключу IP,
 * поэтому параллельные попытки с одного IP сериализуются и пачка запросов не получает больше 5 догадок.
 */
export async function attemptLogin(login: string, password: string, ip: string, db: Db = sharedDb): Promise<LoginResult> {
  const key = `login:${ip}`;
  const result = await db.transaction(async (tx): Promise<SessionSubject | string> => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
    if ((await countRateLimit(key, WINDOW_SEC, tx)) >= MAX_FAILURES) return LOGIN_BLOCKED;
    const subject = await checkCredentials(login, password, tx);
    if (!subject) {
      await recordRateLimit(key, tx);
      return LOGIN_ERROR;
    }
    await clearRateLimit(key, tx);
    if (subject.kind === "user") await tx.update(adminUsers).set({ lastLoginAt: new Date() }).where(eq(adminUsers.id, subject.id));
    return subject;
  });
  if (typeof result === "string") return { ok: false, error: result };
  return { ok: true, token: await signSession(result) };
}

/**
 * Логин владельца (из окружения) — сверка с его хешем; любой другой — поиск сотрудника (без учёта регистра) и сверка с его
 * хешем. В любом случае ровно одна сверка bcrypt: по времени ответа не понять, есть ли такой логин.
 */
async function checkCredentials(login: string, password: string, tx: Tx): Promise<SessionSubject | null> {
  if (isOwnerLogin(login)) {
    const fp = ownerFingerprint();
    return fp && (await verifyCredentials(login, password)) ? { kind: "owner", v: fp } : null;
  }
  const norm = login.trim().toLowerCase();
  const [u] = norm
    ? await tx
        .select({ id: adminUsers.id, hash: adminUsers.passwordHash, active: adminUsers.active, v: adminUsers.tokenVersion })
        .from(adminUsers)
        .where(eq(adminUsers.login, norm))
    : [];
  const ok = await checkPassword(password, u?.active ? u.hash : null);
  return ok && u ? { kind: "user", id: u.id, v: u.v } : null;
}
