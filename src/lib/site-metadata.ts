import type { Metadata } from "next";
import type { SiteContent } from "./site-content";

export function siteOpenGraph(seo: SiteContent["seo"]): Metadata["openGraph"] {
  return {
    type: "website",
    siteName: "Культурная Столица",
    locale: "ru_RU",
    title: seo.socialTitle,
    description: seo.socialDescription,
    images: [{ url: "/brand/og.jpg", width: 1200, height: 630, alt: "Культурная Столица — экскурсии по Петербургу" }],
  };
}
