import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { uploadImage, MAX_IMAGE_BYTES } from "@/server/upload";

const file = (type: string, size = 10, name = "photo.jpg") => new File([new Uint8Array(size)], name, { type });

const ok = () => vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }));

beforeEach(() => {
  vi.stubEnv("S3_ENDPOINT", "https://s3.ru-1.storage.selcloud.ru/");
  vi.stubEnv("S3_REGION", "ru-1");
  vi.stubEnv("S3_BUCKET", "kc-images");
  vi.stubEnv("S3_ACCESS_KEY_ID", "AKID");
  vi.stubEnv("S3_SECRET_ACCESS_KEY", "s3-secret-key");
  vi.stubEnv("S3_PUBLIC_URL", "https://abc123.selstorage.ru/");
});
afterEach(() => vi.unstubAllEnvs());

describe("uploadImage", () => {
  it("кладёт jpeg/png/webp в контейнер подписанным PUT и возвращает публичный адрес", async () => {
    const fetchImpl = ok();
    for (const t of ["image/jpeg", "image/png", "image/webp"]) {
      const url = await uploadImage(file(t), "tours", fetchImpl);
      expect(url).toMatch(/^https:\/\/abc123\.selstorage\.ru\/tours\/photo-[a-z0-9]{8}\.jpg$/);
    }
    const [target, init] = fetchImpl.mock.calls[0];
    const put = new URL(String(target));
    expect(put.origin).toBe("https://s3.ru-1.storage.selcloud.ru");
    expect(put.pathname).toMatch(/^\/kc-images\/tours\/photo-[a-z0-9]{8}\.jpg$/);
    expect(init!.method).toBe("PUT");
    const h = new Headers(init!.headers);
    expect(h.get("content-type")).toBe("image/jpeg");
    expect(h.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(h.get("authorization")).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKID\/\d{8}\/ru-1\/s3\/aws4_request, SignedHeaders=cache-control;content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/,
    );
    expect(h.get("authorization")).not.toContain("s3-secret-key");
  });

  it("принимает изображение главной только с сигнатурой заявленного формата", async () => {
    const fetchImpl = ok();
    await expect(uploadImage(file("image/png"), "site", fetchImpl)).rejects.toThrow(/заявленного формата/);
    expect(fetchImpl).not.toHaveBeenCalled();
    const png = new File([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])], "home.png", { type: "image/png" });
    expect(await uploadImage(png, "site", fetchImpl)).toMatch(/\/site\/home-[a-z0-9]{8}\.png$/);
  });

  it("каждый раз новое имя: одноимённые файлы не затирают друг друга", async () => {
    const fetchImpl = ok();
    const a = await uploadImage(file("image/png", 10, "x.png"), "news", fetchImpl);
    const b = await uploadImage(file("image/png", 10, "x.png"), "news", fetchImpl);
    expect(a).not.toBe(b);
  });

  it("rejects other types with a Russian message and does not upload", async () => {
    const fetchImpl = ok();
    await expect(uploadImage(file("image/gif"), "tours", fetchImpl)).rejects.toThrow(/JPG, PNG или WebP/);
    await expect(uploadImage(file("application/pdf"), "news", fetchImpl)).rejects.toThrow(/JPG, PNG или WebP/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects files over 8 MB and empty files", async () => {
    const fetchImpl = ok();
    await expect(uploadImage(file("image/png", MAX_IMAGE_BYTES + 1), "tours", fetchImpl)).rejects.toThrow(/8 МБ/);
    await expect(uploadImage(file("image/png", 0), "tours", fetchImpl)).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sanitises odd file names", async () => {
    const url = await uploadImage(file("image/png", 10, "../../Фото 1 (копия).PNG"), "news", ok());
    expect(url).toMatch(/^https:\/\/abc123\.selstorage\.ru\/news\/[a-z0-9._-]+$/);
  });

  it("сообщает, что хранилище не настроено, если не хватает любой переменной S3", async () => {
    for (const k of ["S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_PUBLIC_URL"]) {
      vi.stubEnv(k, "");
      const fetchImpl = ok();
      await expect(uploadImage(file("image/png"), "tours", fetchImpl)).rejects.toThrow(
        "Загрузка фото пока недоступна: хранилище не настроено",
      );
      expect(fetchImpl).not.toHaveBeenCalled();
      vi.unstubAllEnvs();
      vi.stubEnv("S3_ENDPOINT", "https://s3.ru-1.storage.selcloud.ru");
      vi.stubEnv("S3_REGION", "ru-1");
      vi.stubEnv("S3_BUCKET", "kc-images");
      vi.stubEnv("S3_ACCESS_KEY_ID", "AKID");
      vi.stubEnv("S3_SECRET_ACCESS_KEY", "s3-secret-key");
      vi.stubEnv("S3_PUBLIC_URL", "https://abc123.selstorage.ru");
    }
  });

  it("отказ хранилища — ошибка с кодом ответа, без ключей", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response("<Error><Code>AccessDenied</Code><Message>no</Message></Error>", { status: 403 }));
    const err = await uploadImage(file("image/png"), "tours", fetchImpl).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("S3: файл не загружен, ответ 403 AccessDenied");
    expect((err as Error).message).not.toContain("s3-secret-key");
  });
});
