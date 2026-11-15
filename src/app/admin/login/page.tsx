import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { safeAdminNext } from "@/lib/auth/next-path";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { LoginForm } from "@/components/admin/LoginForm";

export const metadata: Metadata = { title: "Вход" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const next = safeAdminNext((await searchParams).next);
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token && (await verifySessionToken(token))) redirect(next);
  return (
    <main className="login">
      <div className="login-card">
        <div className="login-brand">Культурная Столица</div>
        <h1 className="login-title">Вход в админку</h1>
        <LoginForm next={next} />
      </div>
    </main>
  );
}
