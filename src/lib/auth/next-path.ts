/**
 * Куда вернуть после входа: только путь внутри админки (`/admin`, `/admin/checkin/…`), без схемы, хоста и `//`,
 * чтобы ссылкой «войти и перейти» нельзя было увести на чужой сайт. Всё остальное — на сводку.
 */
export function safeAdminNext(raw: unknown): string {
  if (typeof raw !== "string") return "/admin";
  return /^\/admin(\/[A-Za-z0-9_-]+)*$/.test(raw) && raw !== "/admin/login" ? raw : "/admin";
}
