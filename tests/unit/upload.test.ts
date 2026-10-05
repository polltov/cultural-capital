import { describe, it, expect, vi, beforeEach } from "vitest";

const put = vi.fn(async (path: string) => ({ url: `https://x.public.blob.vercel-storage.com/${path}` }));
vi.mock("@vercel/blob", () => ({ put: (...a: [string, ...unknown[]]) => put(...(a as [string])) }));

import { uploadImage, MAX_IMAGE_BYTES } from "@/server/upload";

const file = (type: string, size = 10, name = "photo.jpg") => new File([new Uint8Array(size)], name, { type });

beforeEach(() => {
  put.mockClear();
  process.env.BLOB_READ_WRITE_TOKEN = "test-token";
});

describe("uploadImage", () => {
  it("uploads jpeg/png/webp via put with random suffix and returns the url", async () => {
    for (const t of ["image/jpeg", "image/png", "image/webp"]) {
      const url = await uploadImage(file(t), "tours");
      expect(url).toContain("blob.vercel-storage.com");
    }
    const [path, , opts] = put.mock.calls[0] as unknown as [string, unknown, Record<string, unknown>];
    expect(path.startsWith("tours/")).toBe(true);
    expect(opts).toMatchObject({ access: "public", addRandomSuffix: true, contentType: "image/jpeg" });
  });

  it("rejects other types with a Russian message and does not call put", async () => {
    await expect(uploadImage(file("image/gif"), "tours")).rejects.toThrow(/JPG, PNG или WebP/);
    await expect(uploadImage(file("application/pdf"), "news")).rejects.toThrow(/JPG, PNG или WebP/);
    expect(put).not.toHaveBeenCalled();
  });

  it("rejects files over 8 MB and empty files", async () => {
    await expect(uploadImage(file("image/png", MAX_IMAGE_BYTES + 1), "tours")).rejects.toThrow(/8 МБ/);
    await expect(uploadImage(file("image/png", 0), "tours")).rejects.toThrow();
    expect(put).not.toHaveBeenCalled();
  });

  it("sanitises odd file names", async () => {
    await uploadImage(file("image/png", 10, "../../Фото 1 (копия).PNG"), "news");
    const path = put.mock.calls[0][0] as string;
    expect(path).toMatch(/^news\/[a-z0-9._-]+$/);
  });

  it("reports a missing storage token without calling put", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    await expect(uploadImage(file("image/png"), "tours")).rejects.toThrow("Загрузка фото пока недоступна: хранилище не настроено");
    expect(put).not.toHaveBeenCalled();
  });
});
