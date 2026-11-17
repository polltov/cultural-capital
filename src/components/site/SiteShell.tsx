import { contactLinks, requestTourContact, REQUEST_TOUR_LABEL } from "@/lib/contacts";
import { loadPublishedCatalog } from "@/server/catalog";
import { hasPublishedNews } from "@/server/news";
import { getSiteContent } from "@/server/site-content";
import { NAV } from "./Logo";
import { Footer, SkipLink } from "./StaticSections";
import { SiteHeader } from "./SiteHeader";
import { PageTransition } from "./transitions";

/**
 * Каркас публичной страницы: ссылка «к содержимому», шапка, <main id="main"> и подвал. Целиком обёрнут
 * в PageTransition — сдвиг при переходе «вглубь» и «назад»; шапка при этом закреплена (SiteHeader).
 */
export async function SiteShell({ children, cta, mainClassName, showNews }: {
  children: React.ReactNode;
  /** Кнопка в шапке; на странице экскурсии ведёт к её датам, а не в общую афишу. */
  cta?: { href: string; label: string };
  mainClassName?: string;
  showNews?: boolean;
}) {
  const [{ content }, catalog, hasNews] = await Promise.all([
    getSiteContent(),
    cta ? [] : loadPublishedCatalog(),
    showNews ?? hasPublishedNews(),
  ]);
  const contacts = contactLinks(content.contacts);
  const canBuy = catalog.some(({ sessions }) => sessions.some((session) => session.free > 0));
  const request = requestTourContact(contacts);
  const headerAction = cta ?? (canBuy
    ? { href: "/afisha", label: "Купить билет" }
    : request && { href: request.href, label: REQUEST_TOUR_LABEL });
  const nav = NAV.filter(({ href }) => {
    if (href === "/#about") return content.why.items.length > 0;
    if (href === "/#reviews") return content.reviews.items.some((review) => review.published);
    if (href === "/news") return hasNews;
    return true;
  });
  return (
    <PageTransition>
      <div className="site">
        <SkipLink />
        <SiteHeader cta={headerAction} contacts={contacts} nav={nav} />
        <main id="main" className={mainClassName} tabIndex={-1}>{children}</main>
        <Footer contacts={contacts} nav={nav} description={content.footer.description} />
      </div>
    </PageTransition>
  );
}
