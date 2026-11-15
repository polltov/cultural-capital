import { describe, expect, it } from "vitest";
import { AREAS, can, hasFullAccess, ROLE_LABELS, STAFF_ROLES, type Area, type Role } from "@/lib/auth/roles";

const allowed = (role: Role) => AREAS.filter((a) => can(role, a));

describe("права по ролям", () => {
  it("владелец и администратор видят всё", () => {
    for (const role of ["owner", "admin"] as const) {
      expect(allowed(role)).toEqual([...AREAS]);
      expect(hasFullAccess(role)).toBe(true);
    }
  });

  it("редактор: контент и источники продаж, без заказов, сотрудников, цен и списков участников", () => {
    expect(allowed("editor").sort()).toEqual<Area[]>(["content", "sources"]);
    expect(hasFullAccess("editor")).toBe(false);
  });

  it("гид: только списки участников и отметка прихода", () => {
    expect(allowed("guide")).toEqual<Area[]>(["roster"]);
    expect(hasFullAccess("guide")).toBe(false);
  });

  it("редактор — роль сотрудника с подписью", () => {
    expect(STAFF_ROLES).toContain("editor");
    expect(ROLE_LABELS.editor).toBe("Редактор");
  });
});
