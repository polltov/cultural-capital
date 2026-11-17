import type { Metadata } from "next";
import { NotFoundContent } from "@/components/site/NotFoundContent";
import { SiteShell } from "@/components/site/SiteShell";

export const metadata: Metadata = { title: "Страница не найдена", robots: { index: false } };

/** notFound() на страницах сайта: несуществующая экскурсия, новость или заказ. */
export default function NotFound() {
  return (
    // Next передаёт эту границу вместе с обычными страницами; её шрифты загрузятся из CSS при показе 404.
    <SiteShell fontPreloads={[]}>
      <NotFoundContent />
    </SiteShell>
  );
}
