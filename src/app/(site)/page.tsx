import type { Metadata } from "next";
import { contactLinks } from "@/lib/contacts";
import { siteOpenGraph } from "@/lib/site-metadata";
import { getSiteContent } from "@/server/site-content";
import { getPublishedCatalog } from "@/server/catalog";
import { listPublishedFaq } from "@/server/faq";
import { getLatestNews } from "@/server/news";
import { nextAvailable, scheduleOf } from "@/lib/domain/schedule";
import { faqLd, organizationLd } from "@/lib/seo";
import { AfishaPreview } from "@/components/site/Afisha";
import { BookingProvider } from "@/components/site/Booking";
import { Catalog } from "@/components/site/Catalog";
import { JsonLd } from "@/components/site/JsonLd";
import { NewsBlock } from "@/components/site/NewsBlock";
import { ReviewsCarousel } from "@/components/site/ReviewsCarousel";
import { SiteShell } from "@/components/site/SiteShell";
import { Faq, Hero, PrivateTours, Route, Why } from "@/components/site/StaticSections";

// Сеансы уходят в прошлое со временем, свободные места меняются — обновляем раз в 5 минут;
// мутации (админка, покупки) дополнительно сбрасывают кэш всего сайта (revalidatePublicSite).
export const revalidate = 300;

const PREVIEW_DATES = 5;

export async function generateMetadata(): Promise<Metadata> {
  const { content: { seo } } = await getSiteContent();
  return {
    title: { absolute: seo.title },
    description: seo.description,
    openGraph: siteOpenGraph(seo),
  };
}

export default async function HomePage() {
  const [catalog, latestNews, faq, { content }] = await Promise.all([
    getPublishedCatalog(), getLatestNews(3), listPublishedFaq(), getSiteContent(),
  ]);
  const contacts = contactLinks(content.contacts);
  const organization = organizationLd(contacts, content.hero.mainPhoto.url);
  const reviews = content.reviews.items.filter((review) => review.published);
  const schedule = scheduleOf(catalog);
  const faqData = faqLd(faq);
  return (
    <SiteShell>
      <JsonLd data={faqData ? [organization, faqData] : organization} />
      <BookingProvider catalog={catalog}>
        <Hero next={nextAvailable(schedule)} content={content.hero} />
        <Catalog items={catalog} />
        <AfishaPreview items={schedule.slice(0, PREVIEW_DATES)} total={schedule.length} contacts={contacts} />
        <Why content={content.why} />
        <Route content={content.route} />
        {reviews.length > 0 && <ReviewsCarousel content={{ ...content.reviews, items: reviews }} />}
        <PrivateTours content={content.privateTours} contacts={contacts} />
        <NewsBlock items={latestNews} />
        <Faq items={faq} contacts={contacts} />
      </BookingProvider>
    </SiteShell>
  );
}
