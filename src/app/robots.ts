import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

// Админка, страницы заказов (секретные ссылки), личный кабинет и API поисковикам не нужны.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/order/", "/account", "/api/"] },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
