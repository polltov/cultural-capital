import { Footer, SkipLink } from "./StaticSections";
import { SiteHeader } from "./SiteHeader";
import { PageTransition } from "./transitions";

/**
 * Каркас публичной страницы: ссылка «к содержимому», шапка, <main id="main"> и подвал. Целиком обёрнут
 * в PageTransition — сдвиг при переходе «вглубь» и «назад»; шапка при этом закреплена (SiteHeader).
 */
export function SiteShell({ children, cta, mainClassName }: {
  children: React.ReactNode;
  /** Кнопка в шапке; на странице экскурсии ведёт к её датам, а не в общую афишу. */
  cta?: { href: string; label: string };
  mainClassName?: string;
}) {
  return (
    <PageTransition>
      <div className="site">
        <SkipLink />
        <SiteHeader cta={cta} />
        <main id="main" className={mainClassName} tabIndex={-1}>{children}</main>
        <Footer />
      </div>
    </PageTransition>
  );
}
