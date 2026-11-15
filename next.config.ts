import type { NextConfig } from "next";

// Публичный адрес контейнера с фото в объектном хранилище Селектела (см. src/server/s3.ts). Читается при сборке:
// на сервере сборка получает те же переменные, что и сайт (deploy/README.md).
const imagesUrl = (process.env.S3_PUBLIC_URL ?? "").trim().replace(/\/+$/, "");

const nextConfig: NextConfig = {
  // Сайт работает на своём сервере в Docker: сборка кладёт в .next/standalone всё нужное для `node server.js`.
  output: "standalone",
  // Адрес фото — и в серверный, и в браузерный код (обложка в билете рисуется в браузере), см. src/lib/images.ts.
  env: { IMAGES_URL: imagesUrl },
  // globalNotFound: фирменная 404 для несуществующих адресов при двух корневых layout (сайт и админка)
  experimental: { serverActions: { bodySizeLimit: "10mb" }, globalNotFound: true },
  images: {
    // уменьшенные копии под экран делаются только для фото из своего контейнера
    remotePatterns: imagesUrl ? [new URL(`${imagesUrl}/**`)] : [],
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
