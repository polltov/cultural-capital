// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/admin" }));
vi.mock("@/app/admin/login/actions", () => ({ logoutAction: vi.fn() }));

import { AdminShell } from "@/components/admin/AdminShell";
import type { Role } from "@/lib/auth/roles";

afterEach(cleanup);

const menu = (role: Role) => {
  render(
    <AdminShell newOrders={3} viewer={{ name: "Анна", role }}>
      <p>страница</p>
    </AdminShell>,
  );
  return within(screen.getByRole("navigation", { name: "Разделы" }))
    .getAllByRole("link")
    .map((a) => a.textContent?.replace(/\d+$/, ""));
};

describe("меню админки по ролям", () => {
  it("администратору — все разделы", () => {
    expect(menu("admin")).toEqual(["Сводка", "Заказы", "Экскурсии", "Источники", "Новости", "Вопросы", "Сотрудники"]);
  });

  it("редактору — сводка, экскурсии, источники, новости и вопросы", () => {
    expect(menu("editor")).toEqual(["Сводка", "Экскурсии", "Источники", "Новости", "Вопросы"]);
  });

  it("гиду — только сводка", () => {
    expect(menu("guide")).toEqual(["Сводка"]);
  });

  it("подпись роли редактора рядом с именем", () => {
    menu("editor");
    expect(screen.getByText("· Редактор")).toBeTruthy();
  });
});
