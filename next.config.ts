import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // globalNotFound: фирменная 404 для несуществующих адресов при двух корневых layout (сайт и админка)
  experimental: { serverActions: { bodySizeLimit: "10mb" }, globalNotFound: true },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.public.blob.vercel-storage.com" }],
    // к стандартному набору добавлены 320 и 480: обложки в карточках и фото первого экрана занимают 280–440 px,
    // без промежуточных размеров обычный экран получал картинку в полтора раза больше нужной
    imageSizes: [32, 48, 64, 96, 128, 256, 320, 384, 480],
  },
  async headers() {
    return [
      // Файлы из public/ по умолчанию отдаются без кэша: браузер перепроверял каждый шрифт на каждой странице,
      // и текст успевал мигнуть запасным шрифтом. В именах шрифтов есть хэш содержимого — кэшируем навсегда.
      { source: "/fonts/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      // Логотип и орнамент есть на каждой странице; у них имена постоянные, поэтому кэш короткий — замена файла
      // дойдёт до посетителей в течение часа.
      { source: "/brand/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" }] },
    ];
  },
  async redirects() {
    return [
      { source: "/mockups/direction-d.html", destination: "/", permanent: true },
      { source: "/index.html", destination: "/", permanent: true },
    ];
  },
};

export default nextConfig;
