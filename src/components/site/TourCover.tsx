import Image from "next/image";
import { coverVariant } from "@/lib/domain/tour-text";
import "./cover.css";

/** Картинку можно отдать оптимизатору Next: свои файлы и Vercel Blob (см. images.remotePatterns в next.config.ts). */
function optimizable(src: string): boolean {
  return src.startsWith("/") || /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//i.test(src);
}

/**
 * Обложка экскурсии. Есть фото — уменьшенная копия под экран (а не исходник из админки, который бывает и по 8 МБ).
 * Нет фото — фирменная гравюра с атлантами на цветной подложке: одна из четырёх (`variant`, иначе — по `seed`).
 */
export function TourCover({ src, alt, seed, variant, sizes, preload = false }: {
  src: string | null;
  alt: string;
  seed: string;
  /** Номер гравюры (0–3); если не задан — по `seed`. Каталог задаёт его сам, чтобы соседние карточки не повторялись. */
  variant?: number;
  sizes: string;
  preload?: boolean;
}) {
  if (src) {
    return (
      <Image className="cover-img" src={src} alt={alt} fill sizes={sizes} preload={preload} unoptimized={!optimizable(src)} />
    );
  }
  return <span className={`cover-art cover-art--${variant ?? coverVariant(seed)}`} aria-hidden="true" />;
}
