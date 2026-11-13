import type { Metadata } from "next";

/**
 * Иконка вкладки — упрощённый портал с логотипа (перекрытие, две опоры, дверь с аркой) на фирменной терракоте.
 * Гравюра с атлантами в 16 px превращалась в серое пятно, а на тёмной панели вкладок пропадала совсем.
 * SVG — для современных браузеров, PNG 32 и 120 px — для остальных и для поиска (Яндекс берёт 120×120);
 * `public/favicon.ico` лежит в корне для тех, кто запрашивает его по старинке. На экран «Домой» iOS идёт
 * подробная гравюра: в 180 px она читается.
 */
export const siteIcons: NonNullable<Metadata["icons"]> = {
  icon: [
    { url: "/brand/favicon.svg", type: "image/svg+xml" },
    { url: "/brand/favicon-32.png", type: "image/png", sizes: "32x32" },
    { url: "/brand/favicon-120.png", type: "image/png", sizes: "120x120" },
  ],
  apple: [{ url: "/brand/apple-touch-icon.png", sizes: "180x180" }],
};
