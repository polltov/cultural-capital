import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Footer } from "@/components/site/StaticSections";
import { TicketView } from "@/components/site/TicketView";
import { loadOrderPage } from "@/server/order-page";
import { runSyncEffects } from "@/server/payment-sync";

// Страница меняется по мере подтверждения оплаты и открывается по секретной ссылке: не кэшируем и не индексируем.
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Ваш заказ — Культурная Столица",
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ token: string }> };

export default async function OrderPage({ params }: Props) {
  const { token } = await params;
  const page = await loadOrderPage(token);
  if (!page) notFound();

  // Если синк при открытии подтвердил оплату (webhook опоздал) — письмо с билетом и Telegram уходят уже после ответа.
  const { data, outcome } = page;
  if (outcome) after(() => runSyncEffects(outcome));

  return (
    <div className="mock">
      <SiteHeader />
      <main className="order">
        <TicketView {...data} />
      </main>
      <Footer />
    </div>
  );
}
