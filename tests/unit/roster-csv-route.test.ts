import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  viewer: null as null | { role: string },
  getSessionRoster: vi.fn(),
}));

vi.mock("@/lib/auth/viewer", () => ({ getViewer: async () => m.viewer }));
vi.mock("@/server/admin-orders", () => ({
  getSessionRoster: m.getSessionRoster,
  rosterToCsv: () => "﻿csv",
}));

import { GET } from "@/app/admin/(panel)/sessions/[id]/csv/route";

const get = () => GET(new Request("http://x/admin/sessions/3/csv"), { params: Promise.resolve({ id: "3" }) });

beforeEach(() => {
  m.getSessionRoster.mockReset();
  m.getSessionRoster.mockResolvedValue({ rows: [] });
});

describe("CSV со списком участников", () => {
  it("без входа — 401", async () => {
    m.viewer = null;
    expect((await get()).status).toBe(401);
  });

  it("редактору — 403: телефоны и имена покупателей ему не положены", async () => {
    m.viewer = { role: "editor" };
    expect((await get()).status).toBe(403);
    expect(m.getSessionRoster).not.toHaveBeenCalled();
  });

  it("гиду и администратору — файл", async () => {
    for (const role of ["guide", "admin", "owner"]) {
      m.viewer = { role };
      const r = await get();
      expect(r.status).toBe(200);
      expect(r.headers.get("Content-Disposition")).toContain("session-3.csv");
    }
  });
});
