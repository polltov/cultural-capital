import { SiteHeader } from "@/components/site/SiteHeader";
import { Catalog } from "@/components/site/Catalog";
import { ReviewsCarousel } from "@/components/site/ReviewsCarousel";
import { Hero, Why, Route, Guides, Faq, Footer } from "@/components/site/StaticSections";

export default function HomePage() {
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
      <Catalog />
      <Why />
      <Route />
      <Guides />
      <ReviewsCarousel />
      <Faq />
      <Footer />
    </div>
  );
}
