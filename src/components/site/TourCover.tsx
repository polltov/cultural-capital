import Image from "next/image";
import { coverVariant } from "@/lib/domain/tour-text";
import { optimizableImage } from "@/lib/images";
import "./cover.css";

/**
 * Обложка экскурсии. Есть фото — уменьшенная копия под экран (а не исходник из админки, который бывает и по 8 МБ).
 * Нет фото — фирменная гравюра с атлантами на цветной подложке: одна из четырёх (`variant`, иначе — по `seed`).
 */
export function TourCover({ src, alt, seed, variant, sizes, loading }: {
  src: string | null;
  alt: string;
  seed: string;
  /** Номер гравюры (0–3); если не задан — по `seed`. Каталог задаёт его сам, чтобы соседние карточки не повторялись. */
  variant?: number;
  sizes: string;
  loading?: "preload" | "eager";
}) {
  if (src) {
    const eager = loading === "eager";
    return (
      <Image
        className="cover-img" src={src} alt={alt} fill sizes={sizes} preload={loading === "preload"}
        loading={eager ? "eager" : undefined} fetchPriority={eager ? "high" : undefined}
        unoptimized={!optimizableImage(src)}
      />
    );
  }
  return <span className={`cover-art cover-art--${variant ?? coverVariant(seed)}`} aria-hidden="true" />;
}
