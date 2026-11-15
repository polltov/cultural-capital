/**
 * `owner` — учётка из окружения; `admin` — сотрудник с полным доступом; `editor` — тексты сайта без заказов и личных данных
 * покупателей (для маркетолога); `guide` — только сеансы и отметка прихода.
 */
export type Role = "owner" | "admin" | "editor" | "guide";
/** Роли сотрудников из таблицы `admin_users` (владелец в ней не хранится). */
export type StaffRole = Exclude<Role, "owner">;
export const STAFF_ROLES = ["admin", "editor", "guide"] as const satisfies readonly StaffRole[];

export const ROLE_LABELS: Record<Role, string> = { owner: "Владелец", admin: "Администратор", editor: "Редактор", guide: "Гид" };

/**
 * Разделы админки:
 * - `orders` — заказы, возвраты, выручка на сводке;
 * - `staff` — сотрудники;
 * - `pricing` — цены и сеансы экскурсий (даты, лимиты), новые экскурсии;
 * - `content` — новости, вопросы, тексты, обложки, публикация и порядок экскурсий;
 * - `sources` — отчёт «Источники продаж» (только суммы по каналам, без личных данных);
 * - `roster` — списки участников сеансов, их CSV и отметка прихода (имена и телефоны покупателей).
 */
export const AREAS = ["orders", "staff", "pricing", "content", "sources", "roster"] as const;
export type Area = (typeof AREAS)[number];

const ACCESS: Record<Role, readonly Area[]> = {
  owner: AREAS,
  admin: AREAS,
  editor: ["content", "sources"],
  guide: ["roster"],
};

export const can = (role: Role, area: Area): boolean => ACCESS[role].includes(area);

/** Полный доступ — владелец и администраторы. */
export const hasFullAccess = (role: Role): boolean => AREAS.every((a) => can(role, a));
