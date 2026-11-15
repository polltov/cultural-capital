import Link from "next/link";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/viewer";
import { EMPTY_USER, UserForm } from "@/components/admin/UserForm";

export const metadata: Metadata = { title: "Новый сотрудник" };

export default async function NewUserPage() {
  await requireAdmin();
  return (
    <>
      <p className="crumbs"><Link href="/admin/users">← Все сотрудники</Link></p>
      <h1 className="page-title">Новый сотрудник</h1>
      <UserForm id={null} initial={EMPTY_USER} />
    </>
  );
}
