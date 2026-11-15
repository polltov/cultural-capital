"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { CUSTOMER_COOKIE, CUSTOMER_MAX_AGE_SEC, signCustomerSession } from "@/lib/auth/customer";
import { consumeLoginToken, requestLoginLink } from "@/server/account";
import { clientIp } from "@/server/client-ip";

export type LinkState = { sent?: boolean; error?: string; email?: string } | null;

const emailSchema = z.string().trim().min(1).max(254).pipe(z.email());

/** «Пришлите ссылку для входа». Ответ одинаковый, есть ли заказы на этот адрес или нет. */
export async function requestLinkAction(_prev: LinkState, formData: FormData): Promise<LinkState> {
  const raw = String(formData.get("email") ?? "").slice(0, 300);
  // Ловушка для ботов: настоящий посетитель это поле не видит и не заполняет.
  if (String(formData.get("website") ?? "") !== "") return { sent: true };
  const p = emailSchema.safeParse(raw);
  if (!p.success) return { error: "Проверьте email", email: raw };
  const r = await requestLoginLink(p.data, await clientIp());
  if (r === "limited") return { error: "Слишком много попыток. Попробуйте через час.", email: raw };
  return { sent: true, email: p.data };
}

async function setCustomerCookie(email: string) {
  (await cookies()).set(CUSTOMER_COOKIE, await signCustomerSession(email), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CUSTOMER_MAX_AGE_SEC,
  });
}

/**
 * Вход по ссылке из письма — кнопкой, а не самим переходом по ссылке: почтовые сервисы заранее открывают ссылки из писем
 * для проверки, и одноразовая ссылка сгорела бы до того, как ею воспользуется человек.
 */
export async function loginWithLinkAction(token: string): Promise<{ error: string }> {
  const email = await consumeLoginToken(String(token));
  if (!email) return { error: "Ссылка устарела или уже использована. Запросите новую." };
  await setCustomerCookie(email);
  redirect("/account");
}

export async function logoutCustomerAction(): Promise<void> {
  (await cookies()).delete({ name: CUSTOMER_COOKIE, path: "/" });
  redirect("/account");
}
