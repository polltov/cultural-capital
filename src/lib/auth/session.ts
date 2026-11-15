import { createHash, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "cc_admin";
export const SESSION_MAX_AGE_SEC = 30 * 24 * 60 * 60;

// Валидный bcrypt-хеш случайной строки: сравнение выполняется даже при неверном логине,
// чтобы время ответа не выдавало, какая из частей не совпала.
const DUMMY_HASH = "$2b$12$QcuQ6okIROfOqIqaQ2jC5eHBlqDiF0QigvR9Z/Uvfd6RDM7xilboy";

function secretKey(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET не задан или короче 32 символов");
  return new TextEncoder().encode(s);
}

function sha256(v: string): Buffer {
  return createHash("sha256").update(v, "utf8").digest();
}

export async function verifyCredentials(login: string, password: string): Promise<boolean> {
  const expectedLogin = process.env.ADMIN_LOGIN;
  const hash = process.env.ADMIN_PASSWORD_HASH;
  const configured = Boolean(expectedLogin && hash);
  // Хеши одинаковой длины → timingSafeEqual не зависит от длины введённого логина.
  const loginOk = configured && isOwnerLogin(login);
  const passwordOk = await bcrypt.compare(password, configured ? hash! : DUMMY_HASH);
  return configured && loginOk && passwordOk;
}

/** Совпадает ли логин с логином владельца (из окружения); сравнение по времени не зависит от введённого. */
export function isOwnerLogin(login: string): boolean {
  const expected = process.env.ADMIN_LOGIN;
  return Boolean(expected) && timingSafeEqual(sha256(login), sha256(expected!));
}

/** Сверка пароля с хешем сотрудника; без хеша (нет такого логина) — сверка с подставным хешем, ответ `false`. */
export async function checkPassword(password: string, hash: string | null): Promise<boolean> {
  const ok = await bcrypt.compare(password, hash ?? DUMMY_HASH);
  return hash !== null && ok;
}

/**
 * Кто вошёл. Владелец — учётка из окружения; его токен несёт отпечаток логина и хеша пароля, поэтому после смены пароля
 * в app.env на сервере старые сессии владельца перестают действовать. Сотрудник — id и версия токена из `admin_users`.
 */
export type SessionSubject = { kind: "owner"; v: string } | { kind: "user"; id: number; v: number };

/** Отпечаток учётки владельца для его токена; без настроенной учётки — `null`. */
export function ownerFingerprint(): string | null {
  const login = process.env.ADMIN_LOGIN;
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!login || !hash) return null;
  return createHash("sha256").update(`${login}\n${hash}`, "utf8").digest("base64url").slice(0, 22);
}

export async function signSession(subject: SessionSubject): Promise<string> {
  const claims = subject.kind === "owner" ? { sub: "admin", v: subject.v } : { sub: `u:${subject.id}`, v: subject.v };
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SEC}s`)
    .sign(secretKey());
}

/** Подпись и срок токена; кто в нём — без обращения к БД. Авторитетная проверка — `getViewer()` в `viewer.ts`. */
export async function readSessionToken(token: string): Promise<SessionSubject | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (payload.sub === "admin" && typeof payload.v === "string") return { kind: "owner", v: payload.v };
    const m = typeof payload.sub === "string" ? /^u:(\d{1,9})$/.exec(payload.sub) : null;
    if (m && Number.isInteger(payload.v)) return { kind: "user", id: Number(m[1]), v: payload.v as number };
    return null;
  } catch {
    return null;
  }
}

/** Оптимистичная проверка для proxy: только подпись и срок. */
export async function verifySessionToken(token: string): Promise<boolean> {
  return (await readSessionToken(token)) !== null;
}
