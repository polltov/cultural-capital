import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/viewer";
import { UserForm } from "@/components/admin/UserForm";
import { getAdminUser } from "@/server/admin-users";

export const metadata: Metadata = { title: "Сотрудник" };

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireAdmin();
  const { id: raw } = await params;
  if (!/^\d{1,9}$/.test(raw)) notFound();
  const u = await getAdminUser(Number(raw));
  if (!u) notFound();
  return (
    <>
      <p className="crumbs"><Link href="/admin/users">← Все сотрудники</Link></p>
      <h1 className="page-title">{u.name}</h1>
      <p className="muted section-sub">Логин: {u.login}</p>
      <UserForm id={u.id} initial={{ login: u.login, name: u.name, role: u.role, active: u.active, password: "" }} self={u.id === viewer.id} />
    </>
  );
}
