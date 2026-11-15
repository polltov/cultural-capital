import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { safeAdminNext } from "@/lib/auth/next-path";
import { getViewer } from "@/lib/auth/viewer";
import { LoginForm } from "@/components/admin/LoginForm";

export const metadata: Metadata = { title: "Вход" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const next = safeAdminNext((await searchParams).next);
  // Полная проверка, а не только подпись: сессия отключённого сотрудника не должна гонять между входом и админкой.
  if (await getViewer()) redirect(next);
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
