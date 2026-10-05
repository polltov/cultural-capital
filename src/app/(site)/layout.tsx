import type { Metadata, Viewport } from "next";
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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Fonts loaded exactly as in the original static page (no next/font). */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Prata&family=Playfair+Display:ital,wght@0,400;0,500;1,400;1,500&family=PT+Serif:ital,wght@0,400;1,400&family=PT+Sans:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
