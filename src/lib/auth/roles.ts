/** `owner` — учётка из окружения; `admin` — сотрудник с полным доступом; `guide` — только сеансы и отметка прихода. */
export type Role = "owner" | "admin" | "guide";

export const ROLE_LABELS: Record<Role, string> = { owner: "Владелец", admin: "Администратор", guide: "Гид" };
