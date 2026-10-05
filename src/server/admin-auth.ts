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
 */
export async function attemptLogin(login: string, password: string, ip: string, db: Db = sharedDb): Promise<LoginResult> {
  const key = `login:${ip}`;
  if ((await countRateLimit(key, WINDOW_SEC, db)) >= MAX_FAILURES) return { ok: false, error: LOGIN_BLOCKED };
  if (!(await verifyCredentials(login, password))) {
    await recordRateLimit(key, db);
    return { ok: false, error: LOGIN_ERROR };
  }
  await clearRateLimit(key, db);
  return { ok: true, token: await signSession() };
}
