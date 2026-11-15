import { describe, expect, it } from "vitest";
import { safeAdminNext } from "@/lib/auth/next-path";

describe("safeAdminNext", () => {
  it.each(["/admin", "/admin/orders", "/admin/checkin/abc_DEF-123", "/admin/sessions/12"])("путь админки %s — как есть", (p) => {
    expect(safeAdminNext(p)).toBe(p);
  });

  it.each([
    undefined, null, 42, ["/admin/orders"], "", "/", "/admin/login", "//evil.example/admin", "https://evil.example/admin",
    "/admin/../order", "/admin/orders?x=1", "/admin//evil", "/administrator", "/admin\\evil", "/admin/orders/",
  ])("всё остальное (%s) — на сводку", (p) => {
    expect(safeAdminNext(p)).toBe("/admin");
  });
});
