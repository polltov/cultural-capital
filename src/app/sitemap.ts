import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";
import { getPublishedCatalog } from "@/server/catalog";
import { listPublishedNewsSlugs } from "@/server/news";

// Карта сайта для поисковиков: страницы экскурсий и новостей берутся из базы.
// Обновляется раз в час и сразу после правок в админке (revalidatePublicSite сбрасывает весь кэш сайта).
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const [catalog, news] = await Promise.all([getPublishedCatalog(), listPublishedNewsSlugs()]);
  return [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/afisha`, changeFrequency: "daily", priority: 0.9 },
    ...catalog.map(({ tour }) => ({ url: `${base}/tours/${tour.slug}`, changeFrequency: "weekly" as const, priority: 0.8 })),
    { url: `${base}/news`, changeFrequency: "weekly", priority: 0.5 },
    ...news.map((n) => ({ url: `${base}/news/${n.slug}`, lastModified: n.updatedAt, changeFrequency: "monthly" as const, priority: 0.4 })),
    { url: `${base}/offer`, changeFrequency: "yearly", priority: 0.1 },
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.1 },
    { url: `${base}/consent`, changeFrequency: "yearly", priority: 0.1 },
  ];
}
