"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, SESSION_MAX_AGE_SEC } from "@/lib/auth/session";
import { attemptLogin } from "@/server/admin-auth";
import { clientIp } from "@/server/client-ip";

export type LoginState = { error?: string; login?: string } | null;

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const login = String(formData.get("login") ?? "").slice(0, 200);
  const password = String(formData.get("password") ?? "").slice(0, 200);
  const r = await attemptLogin(login, password, await clientIp());
  if (!r.ok) return { error: r.error, login };
  (await cookies()).set(SESSION_COOKIE, r.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  });
  redirect("/admin");
}

// Без requireAdmin(): выход только удаляет cookie — для неавторизованного это no-op, утечки данных нет.
export async function logoutAction(): Promise<void> {
  (await cookies()).delete({ name: SESSION_COOKIE, path: "/" });
  redirect("/admin/login");
}
