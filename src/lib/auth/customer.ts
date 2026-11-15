import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

/** Cookie личного кабинета покупателя — отдельно от админки: другое имя и другая «аудитория» токена. */
export const CUSTOMER_COOKIE = "cc_customer";
export const CUSTOMER_MAX_AGE_SEC = 30 * 24 * 60 * 60;
const AUDIENCE = "customer";

function secretKey(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET не задан или короче 32 символов");
  return new TextEncoder().encode(s);
}

export async function signCustomerSession(email: string): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${CUSTOMER_MAX_AGE_SEC}s`)
    .sign(secretKey());
}

/** Email из токена кабинета; токен админки сюда не подходит (нет нужной аудитории). */
export async function verifyCustomerSession(token: string): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"], audience: AUDIENCE });
    return typeof payload.email === "string" && payload.email ? payload.email : null;
  } catch {
    return null;
  }
}

/** Кто вошёл в личный кабинет (email в нижнем регистре); `null` — никто. */
export async function getCustomerEmail(): Promise<string | null> {
  const token = (await cookies()).get(CUSTOMER_COOKIE)?.value;
  return token ? verifyCustomerSession(token) : null;
}
