import type { Metadata, Viewport } from "next";
import { preloadCriticalFonts } from "@/lib/critical-fonts";
import { siteIcons } from "@/lib/site-icons";
import { siteUrl } from "@/lib/site-url";
import "../fonts.css";
import "./site.css";

const DESCRIPTION =
  "Экскурсии по Санкт-Петербургу для детей и взрослых: авторские маршруты, маленькие группы до 8 человек, история через игру. Билеты онлайн.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: "Культурная Столица — экскурсии по Петербургу для детей и взрослых",
    template: "%s — Культурная Столица",
  },
  description: DESCRIPTION,
  applicationName: "Культурная Столица",
  openGraph: {
    type: "website",
    siteName: "Культурная Столица",
    locale: "ru_RU",
    title: "Культурная Столица — экскурсии по Петербургу для семьи",
    description: "Авторские маршруты для детей и взрослых. Маленькие группы до 8 человек.",
    images: [{ url: "/brand/og.jpg", width: 1200, height: 630, alt: "Культурная Столица — экскурсии по Петербургу" }],
  },
  icons: siteIcons,
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f5ede0",
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  preloadCriticalFonts();
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
