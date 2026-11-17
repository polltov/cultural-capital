import type { Metadata, Viewport } from "next";
import { siteIcons } from "@/lib/site-icons";
import { defaultSiteContent } from "@/lib/site-content";
import { siteOpenGraph } from "@/lib/site-metadata";
import { siteUrl } from "@/lib/site-url";
import { Analytics } from "@/components/site/Analytics";
import "../fonts.css";
import "./site.css";

// Кнопка в общей шапке зависит от ближайших сеансов, которые со временем уходят из афиши.
export const revalidate = 300;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: defaultSiteContent.seo.title,
    template: "%s — Культурная Столица",
  },
  description: defaultSiteContent.seo.description,
  applicationName: "Культурная Столица",
  openGraph: siteOpenGraph(defaultSiteContent.seo),
  icons: siteIcons,
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f5ede0",
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" data-scroll-behavior="smooth">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
