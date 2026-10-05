import type { Metadata, Viewport } from "next";
import "./(panel)/admin.css";

export const metadata: Metadata = {
  title: { default: "Админка — Культурная Столица", template: "%s — админка" },
  robots: { index: false, follow: false },
  icons: { icon: [{ url: "/assets/favicon.png", type: "image/png" }] },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fbf6f0",
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Prata&family=PT+Sans:wght@400;700&display=swap" rel="stylesheet" />
      </head>
      <body className="adm">{children}</body>
    </html>
  );
}
