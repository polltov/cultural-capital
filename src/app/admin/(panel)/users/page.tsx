import Link from "next/link";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/viewer";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { formatDateNumeric, formatTime } from "@/lib/domain/moscow-time";
import { listAdminUsers } from "@/server/admin-users";

export const metadata: Metadata = { title: "Сотрудники" };

export default async function UsersPage() {
  const viewer = await requireAdmin();
  const users = await listAdminUsers();
  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Сотрудники</h1>
        <Link href="/admin/users/new" className="btn btn-accent">
          Добавить сотрудника
        </Link>
      </div>
      <p className="muted section-sub">
        У каждого свой логин и пароль. Администратор видит всё; гид — только ближайшие сеансы, списки участников и отметку
        прихода. Вход владельца ({process.env.ADMIN_LOGIN || "не настроен"}) задаётся в настройках сервера (файл app.env) и здесь не меняется.
      </p>
      {users.length === 0 ? (
        <p className="empty">Пока никого не добавили.</p>
      ) : (
        <div className="table-scroll">
          <table className="orders-table users-table">
            <thead>
              <tr>
                <th>Имя</th>
                <th>Логин</th>
                <th>Роль</th>
                <th>Последний вход</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={u.active ? undefined : "is-off"}>
                  <td>
                    <Link href={`/admin/users/${u.id}`} className="text-link">
                      {u.name}
                    </Link>
                    {u.id === viewer.id && <span className="muted"> (вы)</span>}
                  </td>
                  <td className="nowrap">{u.login}</td>
                  <td>{u.active ? ROLE_LABELS[u.role] : <span className="muted">вход отключён</span>}</td>
                  <td className="nowrap">{u.lastLoginAt ? `${formatDateNumeric(u.lastLoginAt)}, ${formatTime(u.lastLoginAt)}` : <span className="muted">не входил</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
