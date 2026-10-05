import { getPublishedCatalog } from "@/server/catalog";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Catalog } from "@/components/site/Catalog";
import { ReviewsCarousel } from "@/components/site/ReviewsCarousel";
import { Hero, Why, Route, Guides, Faq, Footer } from "@/components/site/StaticSections";

// Сеансы уходят в прошлое со временем, свободные места меняются — обновляем раз в 5 минут;
// мутации (админка, заявки) дополнительно вызывают revalidatePath('/').
export const revalidate = 300;

export default async function HomePage() {
  const catalog = await getPublishedCatalog();
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
      <Why />
      <Route />
      <Guides />
      <ReviewsCarousel />
      <Faq />
      <Footer />
    </div>
  );
}
