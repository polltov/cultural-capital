import type { Metadata, Viewport } from "next";
import "../fonts.css";
import "./site.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL || "https://cultural-capital.vercel.app"),
  title: "Культурная Столица — экскурсии по Петербургу для детей и взрослых",
  description:
    "Экскурсии по Санкт-Петербургу для детей и взрослых: авторские маршруты, маленькие группы до 8 человек, подача через игры.",
  openGraph: {
    type: "website",
    title: "Культурная Столица — экскурсии по Петербургу для семьи",
    description: "Авторские маршруты для детей и взрослых. Маленькие группы до 8 человек.",
    images: ["/assets/dvortsovaya.jpg"],
  },
  icons: { icon: [{ url: "/assets/favicon.png", type: "image/png" }] },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f5ede0",
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
