import { getPublishedCatalog } from "@/server/catalog";
import { listPublishedFaq } from "@/server/faq";
import { getLatestNews } from "@/server/news";
import { NewsBlock } from "@/components/site/NewsBlock";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Catalog } from "@/components/site/Catalog";
import { ReviewsCarousel } from "@/components/site/ReviewsCarousel";
import { Hero, Why, Route, Faq, Footer } from "@/components/site/StaticSections";

// Сеансы уходят в прошлое со временем, свободные места меняются — обновляем раз в 5 минут;
// мутации (админка, заявки) дополнительно вызывают revalidatePath('/').
export const revalidate = 300;

export default async function HomePage() {
  const [catalog, latestNews, faq] = await Promise.all([getPublishedCatalog(), getLatestNews(3), listPublishedFaq()]);
  return (
    <div className="mock" id="top">
      <div className="blob b1"></div>
      <div className="blob b2"></div>
      <div className="blob b3"></div>
      <div className="blob b4"></div>
      <div className="blob b5"></div>
      <div className="blob b6"></div>
      <SiteHeader />
      <Hero />
      <Catalog items={catalog} />
      <NewsBlock items={latestNews} />
      <Why />
      <Route />
      <ReviewsCarousel />
      <Faq items={faq} />
      <Footer />
    </div>
  );
}
