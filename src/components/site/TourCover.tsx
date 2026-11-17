import Image from "next/image";
import { coverVariant } from "@/lib/domain/tour-text";
import { optimizableImage } from "@/lib/images";
import "./cover.css";

/**
 * Обложка экскурсии. Есть фото — уменьшенная копия под экран (а не исходник из админки, который бывает и по 8 МБ).
 * Нет фото — фирменная гравюра с атлантами на цветной подложке: одна из четырёх (`variant`, иначе — по `seed`).
 */
export function TourCover({ src, alt, seed, variant, sizes, loading, mobileAvif }: {
  src: string | null;
  alt: string;
  seed: string;
  /** Номер гравюры (0–3); если не задан — по `seed`. Каталог задаёт его сам, чтобы соседние карточки не повторялись. */
  variant?: number;
  sizes: string;
  loading?: "preload" | "eager";
  mobileAvif?: string;
}) {
  if (src) {
    const eager = loading === "eager";
    const image = (
      <Image
        className="cover-img" src={src} alt={alt} fill sizes={sizes} preload={loading === "preload"}
        loading={eager ? "eager" : undefined} fetchPriority={eager ? "high" : undefined}
        unoptimized={!optimizableImage(src)}
      />
    );
    return mobileAvif ? (
      <picture>
        <source media="(max-width: 480px)" type="image/avif" srcSet={mobileAvif} />
        {image}
      </picture>
    ) : image;
  }
  return <span className={`cover-art cover-art--${variant ?? coverVariant(seed)}`} aria-hidden="true" />;
}
