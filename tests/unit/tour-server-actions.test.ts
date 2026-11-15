import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  role: "editor" as string,
  requireAccess: vi.fn(),
  requireAdmin: vi.fn(),
  saveTour: vi.fn(),
  saveTourContent: vi.fn(),
  saveSession: vi.fn(),
  deleteSession: vi.fn(),
  setTourPublished: vi.fn(),
  reorderTours: vi.fn(),
  uploadImage: vi.fn(),
}));

vi.mock("@/lib/auth/viewer", () => ({ requireAccess: m.requireAccess, requireAdmin: m.requireAdmin }));
vi.mock("@/server/tours", () => ({
  saveTour: m.saveTour,
  saveTourContent: m.saveTourContent,
  saveSession: m.saveSession,
  deleteSession: m.deleteSession,
  setTourPublished: m.setTourPublished,
  reorderTours: m.reorderTours,
}));
vi.mock("@/server/upload", () => ({ uploadImage: m.uploadImage, UploadError: class extends Error {} }));
vi.mock("@/server/revalidate", () => ({ revalidatePublicSite: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  deleteSessionAction, reorderAction, saveSessionAction, saveTourAction, setPublishedAction, uploadCoverAction,
} from "@/app/admin/(panel)/tours/actions";

const REDIRECT = new Error("NEXT_REDIRECT");
const FULL = new Set(["owner", "admin"]);

beforeEach(() => {
  vi.clearAllMocks();
  m.requireAccess.mockImplementation(async (area: string) => {
    const editorOk = area === "content" || area === "sources";
    if (FULL.has(m.role) || (m.role === "editor" && editorOk)) return { id: 1, role: m.role };
    throw REDIRECT;
  });
  m.requireAdmin.mockImplementation(async () => {
    if (FULL.has(m.role)) return { id: 1, role: m.role };
    throw REDIRECT;
  });
  for (const f of [m.saveTour, m.saveTourContent]) f.mockResolvedValue({ ok: true, id: 5 });
  for (const f of [m.setTourPublished, m.reorderTours, m.deleteSession]) f.mockResolvedValue({ ok: true });
  m.saveSession.mockResolvedValue({ ok: true, id: 9 });
  m.uploadImage.mockResolvedValue("https://img/x.webp");
});

const input = { title: "Эрмитаж", priceChild: 1, priceAdult: 1 };

describe("экскурсии: действия редактора", () => {
  it("правка редактора идёт через saveTourContent — цены не трогаются", async () => {
    m.role = "editor";
    expect(await saveTourAction(5, input)).toEqual({ ok: true, id: 5 });
    expect(m.saveTourContent).toHaveBeenCalledWith(5, input);
    expect(m.saveTour).not.toHaveBeenCalled();
  });

  it("новую экскурсию редактор создать не может", async () => {
    m.role = "editor";
    const r = await saveTourAction(null, input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors.form).toMatch(/администратор/);
    expect(m.saveTour).not.toHaveBeenCalled();
    expect(m.saveTourContent).not.toHaveBeenCalled();
  });

  it("сеансы редактору недоступны даже прямым вызовом", async () => {
    m.role = "editor";
    await expect(saveSessionAction({ tourId: 5, startsAt: "2026-12-01T11:00", capacity: "8", hidden: false })).rejects.toBe(REDIRECT);
    await expect(deleteSessionAction(9)).rejects.toBe(REDIRECT);
    expect(m.saveSession).not.toHaveBeenCalled();
    expect(m.deleteSession).not.toHaveBeenCalled();
  });

  it("публикация, порядок и обложка редактору доступны", async () => {
    m.role = "editor";
    expect(await setPublishedAction(5, true)).toEqual({ ok: true });
    expect(await reorderAction([5, 6])).toEqual({ ok: true });
    const fd = new FormData();
    fd.set("file", new File(["x"], "a.jpg", { type: "image/jpeg" }));
    expect(await uploadCoverAction(fd)).toEqual({ ok: true, url: "https://img/x.webp" });
    expect(m.requireAccess).toHaveBeenCalledWith("content");
  });

  it("администратор сохраняет экскурсию целиком, с ценами", async () => {
    m.role = "admin";
    expect(await saveTourAction(5, input)).toEqual({ ok: true, id: 5 });
    expect(m.saveTour).toHaveBeenCalledWith(input, 5);
    expect(m.saveTourContent).not.toHaveBeenCalled();
    expect(await saveTourAction(null, input)).toEqual({ ok: true, id: 5 });
    expect(m.saveTour).toHaveBeenLastCalledWith(input, undefined);
  });

  it("гиду экскурсии недоступны", async () => {
    m.role = "guide";
    await expect(saveTourAction(5, input)).rejects.toBe(REDIRECT);
    await expect(setPublishedAction(5, true)).rejects.toBe(REDIRECT);
  });
});
