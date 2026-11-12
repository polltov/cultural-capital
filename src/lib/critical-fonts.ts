import { preload } from "react-dom";

/**
 * Шрифты первого экрана: кириллица заголовков, курсивных акцентов, основного текста и интерфейса.
 * Браузер узнаёт о шрифтах только из CSS, уже начав раскладывать страницу, — предзагрузка запускает их скачивание
 * сразу, вместе со стилями, и текст с первой отрисовки (или почти сразу) набран «своим» шрифтом.
 * Латинские половинки (цифры, знаки) и редкие начертания грузятся как обычно: их мало, и до подгрузки вместо них
 * стоит подогнанный по ширине запасной шрифт (см. конец fonts.css).
 * Имена файлов — те же, что в src/app/fonts.css (сверяется тестом).
 */
export const CRITICAL_FONTS = [
  "/fonts/prata-normal-cyrillic-d06632.woff2", // заголовки
  "/fonts/playfair-display-italic-cyrillic-711017.woff2", // курсив в заголовках
  "/fonts/pt-serif-normal-cyrillic-93f404.woff2", // основной текст
  "/fonts/pt-sans-normal-cyrillic-4608c3.woff2", // меню, подписи
  "/fonts/pt-sans-normal-cyrillic-00c236.woff2", // кнопки, надзаголовки (жирный)
] as const;

/** Вызывается при рендере корневого layout: React добавляет <link rel="preload" as="font"> в <head>. */
export function preloadCriticalFonts(): void {
  // crossOrigin обязателен: шрифты всегда запрашиваются в режиме CORS, иначе предзагруженный файл скачается второй раз
  for (const href of CRITICAL_FONTS) preload(href, { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
}
