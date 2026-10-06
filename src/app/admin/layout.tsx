import type { Metadata, Viewport } from "next";
import "../fonts.css";
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
      <body className="adm">{children}</body>
    </html>
  );
}
