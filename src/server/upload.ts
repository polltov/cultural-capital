import { randomBytes } from "node:crypto";
import { putObject, s3Config } from "./s3";

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
export const NO_STORAGE_MESSAGE = "Загрузка фото пока недоступна: хранилище не настроено";

export class UploadError extends Error {}

function safeName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[-.]+|-+$/g, "");
  return cleaned || "image";
}

/** `tours/photo.jpg` → `tours/photo-k3j9x2ab.jpg`: случайная часть не даёт затереть файл с тем же именем. */
function objectKey(folder: string, name: string): string {
  const safe = safeName(name);
  const dot = safe.lastIndexOf(".");
  const [stem, ext] = dot > 0 ? [safe.slice(0, dot), safe.slice(dot)] : [safe, ""];
  return `${folder}/${stem.slice(0, 60)}-${randomBytes(6).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "0")}${ext}`;
}

/**
 * Загружает картинку в объектное хранилище (S3 Селектела) и возвращает публичный URL. Ошибки — с понятным русским
 * текстом. Имя файла уникальное, поэтому браузеры и оптимизатор картинок кэшируют его навсегда.
 */
export async function uploadImage(file: File, folder: "tours" | "news", fetchImpl: typeof fetch = fetch): Promise<string> {
  if (!ALLOWED.includes(file.type)) throw new UploadError("Подходят только изображения JPG, PNG или WebP");
  if (file.size === 0) throw new UploadError("Файл пустой");
  if (file.size > MAX_IMAGE_BYTES) throw new UploadError("Файл больше 8 МБ — выберите фото поменьше");
  const cfg = s3Config();
  if (!cfg) throw new UploadError(NO_STORAGE_MESSAGE);
  const body = new Uint8Array(await file.arrayBuffer());
  return putObject(cfg, objectKey(folder, file.name), body, {
    contentType: file.type,
    cacheControl: "public, max-age=31536000, immutable",
  }, fetchImpl);
}
