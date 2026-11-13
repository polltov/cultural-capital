import type { Metadata, Viewport } from "next";
import { siteIcons } from "@/lib/site-icons";
import "../fonts.css";
import "./(panel)/admin.css";

export const metadata: Metadata = {
  title: { default: "Админка — Культурная Столица", template: "%s — админка" },
  robots: { index: false, follow: false },
  icons: siteIcons,
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
