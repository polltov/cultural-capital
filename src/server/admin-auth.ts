import { sql } from "drizzle-orm";
import { db as sharedDb, type Db } from "@/db/client";
import { signSession, verifyCredentials } from "@/lib/auth/session";
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
  const error = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
    if ((await countRateLimit(key, WINDOW_SEC, tx)) >= MAX_FAILURES) return LOGIN_BLOCKED;
    if (!(await verifyCredentials(login, password))) {
      await recordRateLimit(key, tx);
      return LOGIN_ERROR;
    }
    await clearRateLimit(key, tx);
    return null;
  });
  if (error) return { ok: false, error };
  return { ok: true, token: await signSession() };
}
