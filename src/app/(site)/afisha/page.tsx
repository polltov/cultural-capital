import Link from "next/link";
import type { Metadata } from "next";
import { EmptySchedule } from "@/components/site/Afisha";
import { BookingProvider } from "@/components/site/Booking";
import { ScheduleList } from "@/components/site/Schedule";
import { SiteShell } from "@/components/site/SiteShell";
import { groupByMonth, scheduleOf } from "@/lib/domain/schedule";
import { HOLD_MINUTES, pluralRu } from "@/lib/domain/seats";
import { getPublishedCatalog } from "@/server/catalog";
import { NAV_BACK } from "@/components/site/transitions";

// Как главная: даты и места обновляются раз в 5 минут и сразу после покупок и правок в админке.
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Афиша экскурсий",
  description: "Все ближайшие даты экскурсий «Культурной Столицы» по Петербургу для детей и взрослых: свободные места и билеты онлайн.",
  alternates: { canonical: "/afisha" },
};

export default async function AfishaPage() {
  const catalog = await getPublishedCatalog();
  const months = groupByMonth(scheduleOf(catalog));
  return (
    <SiteShell mainClassName="afisha-page">
      <BookingProvider catalog={catalog}>
        <div className="wrap">
          <nav className="crumbs" aria-label="Навигационная цепочка">
            <ol><li><Link href="/" transitionTypes={NAV_BACK}>Главная</Link></li><li aria-current="page">Афиша</li></ol>
          </nav>
          <header className="page-head">
            <p className="kicker">Афиша</p>
            <h1 className="page-title">Все <em>даты</em> экскурсий</h1>
            <p className="page-lead">Выберите день и купите билет онлайн — места держатся за вами {HOLD_MINUTES} минут, пока вы оплачиваете, а билет и чек приходят на почту.</p>
          </header>
          {months.length === 0 ? (
            <EmptySchedule />
          ) : (
            months.map((m) => (
              <section className="month" key={m.key} aria-labelledby={`m-${m.key}`}>
                <h2 className="month-title" id={`m-${m.key}`}>
                  {m.title}
                  <small>{m.items.length} {pluralRu(m.items.length, ["экскурсия", "экскурсии", "экскурсий"])}</small>
                </h2>
                <ScheduleList items={m.items} />
              </section>
            ))
          )}
        </div>
      </BookingProvider>
    </SiteShell>
  );
}
