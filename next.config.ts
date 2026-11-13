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
      {
        source: "/:path*",
        headers: [
          // браузер не угадывает тип файла по содержимому (загруженная «картинка» не выполнится как скрипт)
          { key: "X-Content-Type-Options", value: "nosniff" },
          // на чужие сайты уходит только адрес сайта, без пути: ссылка на билет /order/<токен> секретная, и старые
          // браузеры без этого заголовка передавали бы её целиком при переходе по внешней ссылке
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      // админку нельзя встроить во фрейм на чужой странице (защита от подмены кликов)
      { source: "/admin/:path*", headers: [{ key: "X-Frame-Options", value: "DENY" }] },
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
