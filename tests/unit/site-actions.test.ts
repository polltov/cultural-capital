import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAccess: vi.fn(),
  saveSiteSection: vi.fn(),
  revalidatePublicSite: vi.fn(),
}));

vi.mock("@/lib/auth/viewer", () => ({ requireAccess: mocks.requireAccess }));
vi.mock("@/server/site-content", () => ({ saveSiteSection: mocks.saveSiteSection }));
vi.mock("@/server/revalidate", () => ({ revalidatePublicSite: mocks.revalidatePublicSite }));

import { saveSiteSectionAction } from "@/app/admin/(panel)/site/actions";

beforeEach(() => vi.resetAllMocks());

describe("публикация контента сайта", () => {
  it("проверяет право на редактирование перед записью", async () => {
    mocks.requireAccess.mockRejectedValue(new Error("redirect"));
    await expect(saveSiteSectionAction("hero", 0, {})).rejects.toThrow("redirect");
    expect(mocks.requireAccess).toHaveBeenCalledWith("content");
    expect(mocks.saveSiteSection).not.toHaveBeenCalled();
  });

  it("перестраивает публичные страницы после сохранения", async () => {
    const input = { description: "О нас" };
    mocks.saveSiteSection.mockResolvedValue({ ok: true, revision: 1, content: input });
    await expect(saveSiteSectionAction("footer", 0, input)).resolves.toMatchObject({ ok: true, revision: 1 });
    expect(mocks.saveSiteSection).toHaveBeenCalledWith("footer", 0, input);
    expect(mocks.revalidatePublicSite).toHaveBeenCalledOnce();
  });
});
