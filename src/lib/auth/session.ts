import { createHash, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

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
  const loginOk = configured && timingSafeEqual(sha256(login), sha256(expectedLogin!));
  const passwordOk = await bcrypt.compare(password, configured ? hash! : DUMMY_HASH);
  return configured && loginOk && passwordOk;
}

export async function signSession(): Promise<string> {
  return new SignJWT({ sub: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SEC}s`)
    .sign(secretKey());
}

export async function verifySessionToken(token: string): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    return payload.sub === "admin";
  } catch {
    return false;
  }
}

/** Авторитетная проверка: вызывать в (panel)/layout.tsx и в начале каждого admin Server Action. */
export async function requireAdmin(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !(await verifySessionToken(token))) redirect("/admin/login");
}
