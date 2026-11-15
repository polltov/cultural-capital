import { describe, expect, it } from "vitest";
import { optimizableImage } from "@/lib/images";

describe("optimizableImage", () => {
  const bucket = "https://abc.selstorage.ru";
  it("свои файлы и фото из своего контейнера — через оптимизатор", () => {
    expect(optimizableImage("/brand/og.jpg", bucket)).toBe(true);
    expect(optimizableImage("https://abc.selstorage.ru/tours/a.jpg", bucket)).toBe(true);
  });
  it("чужие адреса и похожие хосты — как есть", () => {
    expect(optimizableImage("https://abc.selstorage.ru.evil.example/a.jpg", bucket)).toBe(false);
    expect(optimizableImage("https://x.public.blob.vercel-storage.com/a.jpg", bucket)).toBe(false);
    expect(optimizableImage("//evil.example/a.jpg", bucket)).toBe(false);
  });
  it("контейнер не настроен — только свои файлы", () => {
    expect(optimizableImage("/a.jpg", "")).toBe(true);
    expect(optimizableImage("https://abc.selstorage.ru/tours/a.jpg", "")).toBe(false);
  });
});
