import { contactLinks } from "@/lib/contacts";
import { getSiteContent } from "@/server/site-content";
import { NAV } from "./Logo";
import { Footer, SkipLink } from "./StaticSections";
import { SiteHeader } from "./SiteHeader";
import { PageTransition } from "./transitions";

/**
 * Каркас публичной страницы: ссылка «к содержимому», шапка, <main id="main"> и подвал. Целиком обёрнут
 * в PageTransition — сдвиг при переходе «вглубь» и «назад»; шапка при этом закреплена (SiteHeader).
 */
export async function SiteShell({ children, cta, mainClassName }: {
  children: React.ReactNode;
  /** Кнопка в шапке; на странице экскурсии ведёт к её датам, а не в общую афишу. */
  cta?: { href: string; label: string };
  mainClassName?: string;
}) {
  const { content } = await getSiteContent();
  const contacts = contactLinks(content.contacts);
  const nav = NAV.filter(({ href }) => {
    if (href === "/#about") return content.why.items.length > 0;
    if (href === "/#reviews") return content.reviews.items.some((review) => review.published);
    return true;
  });
  return (
    <PageTransition>
      <div className="site">
        <SkipLink />
        <SiteHeader cta={cta} contacts={contacts} nav={nav} />
        <main id="main" className={mainClassName} tabIndex={-1}>{children}</main>
        <Footer contacts={contacts} nav={nav} description={content.footer.description} />
      </div>
    </PageTransition>
  );
}
