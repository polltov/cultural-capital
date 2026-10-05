import { put } from "@vercel/blob";

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
export const NO_STORAGE_MESSAGE = "Загрузка фото пока недоступна: хранилище не настроено";

export class UploadError extends Error {}

function safeName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[-.]+|-+$/g, "");
  return cleaned || "image";
}

/** Загружает картинку в Vercel Blob и возвращает публичный URL. Ошибки — с понятным русским текстом. */
export async function uploadImage(file: File, folder: "tours" | "news"): Promise<string> {
  if (!ALLOWED.includes(file.type)) throw new UploadError("Подходят только изображения JPG, PNG или WebP");
  if (file.size === 0) throw new UploadError("Файл пустой");
  if (file.size > MAX_IMAGE_BYTES) throw new UploadError("Файл больше 8 МБ — выберите фото поменьше");
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new UploadError(NO_STORAGE_MESSAGE);
  const blob = await put(`${folder}/${safeName(file.name)}`, file, {
    access: "public",
    addRandomSuffix: true,
    contentType: file.type,
  });
  return blob.url;
}
