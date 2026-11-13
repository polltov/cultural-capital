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

export default async function HomePage() {
  const [catalog, latestNews, faq] = await Promise.all([getPublishedCatalog(), getLatestNews(3), listPublishedFaq()]);
  const schedule = scheduleOf(catalog);
  const faqData = faqLd(faq);
  return (
    <SiteShell>
      <JsonLd data={faqData ? [organizationLd(), faqData] : organizationLd()} />
      <BookingProvider catalog={catalog}>
        <Hero next={nextAvailable(schedule)} />
        <Catalog items={catalog} />
        <AfishaPreview items={schedule.slice(0, PREVIEW_DATES)} total={schedule.length} />
        <Why />
        <Route />
        <ReviewsCarousel />
        <PrivateTours />
        <NewsBlock items={latestNews} />
        <Faq items={faq} />
      </BookingProvider>
    </SiteShell>
  );
}
