import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  row: null as null | { id: number; login: string; name: string; role: string; active: boolean; v: number },
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "token" }) }) }));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));
vi.mock("@/lib/auth/session", () => ({
  SESSION_COOKIE: "kc_admin",
  ownerFingerprint: () => "fp",
  readSessionToken: async () => ({ kind: "user", id: 7, v: 0 }),
}));
vi.mock("@/db/client", () => ({
  db: { select: () => ({ from: () => ({ where: async () => (m.row ? [m.row] : []) }) }) },
}));

import { requireAccess, requireAdmin, requireStaff } from "@/lib/auth/viewer";

const as = (role: string) => {
  m.row = { id: 7, login: "anna", name: "Анна", role, active: true, v: 0 };
};

// В фигурных скобках: функция, возвращённая из beforeEach, считается очисткой и вызывается после теста.
beforeEach(() => {
  m.redirect.mockClear();
});

describe("охрана страниц и действий админки", () => {
  it("редактор проходит в контент и источники", async () => {
    as("editor");
    await expect(requireAccess("content")).resolves.toMatchObject({ role: "editor" });
    await expect(requireAccess("sources")).resolves.toMatchObject({ role: "editor" });
  });

  it("редактора отправляет на сводку с заказов, сотрудников, цен и списков участников", async () => {
    as("editor");
    for (const area of ["orders", "staff", "pricing", "roster"] as const) {
      await expect(requireAccess(area)).rejects.toThrow("NEXT_REDIRECT /admin");
    }
  });

  it("requireAdmin пускает только полный доступ: редактора и гида — нет", async () => {
    as("editor");
    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT /admin");
    as("guide");
    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT /admin");
    as("admin");
    await expect(requireAdmin()).resolves.toMatchObject({ role: "admin" });
  });

  it("гид проходит к спискам участников, но не к контенту", async () => {
    as("guide");
    await expect(requireAccess("roster")).resolves.toMatchObject({ role: "guide" });
    await expect(requireAccess("content")).rejects.toThrow("NEXT_REDIRECT /admin");
  });

  it("без входа — на страницу входа", async () => {
    m.row = null;
    await expect(requireStaff()).rejects.toThrow("NEXT_REDIRECT /admin/login");
    await expect(requireAccess("content")).rejects.toThrow("NEXT_REDIRECT /admin/login");
  });
});
