/**
 * Можно ли отдать картинку оптимизатору Next (уменьшенная копия под экран): свои файлы из public/ и фото из контейнера
 * объектного хранилища (`S3_PUBLIC_URL`, в сборку попадает как `IMAGES_URL`, см. images.remotePatterns в next.config.ts).
 * Остальные адреса показываются как есть.
 */
export function optimizableImage(src: string, imagesUrl: string = process.env.IMAGES_URL ?? ""): boolean {
  if (src.startsWith("/") && !src.startsWith("//")) return true;
  return imagesUrl !== "" && src.startsWith(`${imagesUrl}/`);
}
