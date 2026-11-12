import type { Metadata } from "next";
import { NotFoundContent } from "@/components/site/NotFoundContent";
import { SiteShell } from "@/components/site/SiteShell";
import "./fonts.css";
import "./(site)/site.css";

// У приложения два корневых layout (сайт и админка), поэтому 404 для адресов, которых нет вовсе, — отдельной
// страницей в обход layout (experimental.globalNotFound в next.config.ts). Шрифты и стили подключаются здесь же.
export const metadata: Metadata = {
  title: "Страница не найдена — Культурная Столица",
  robots: { index: false },
  icons: { icon: [{ url: "/assets/favicon.png", type: "image/png" }] },
};

export default function GlobalNotFound() {
  return (
    <html lang="ru">
      <body>
        <SiteShell>
          <NotFoundContent />
        </SiteShell>
      </body>
    </html>
  );
}
