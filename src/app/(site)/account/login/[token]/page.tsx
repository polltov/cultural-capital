import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/site/SiteShell";
import { LinkLoginForm } from "@/components/site/AccountForms";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Вход в личный кабинет", robots: { index: false, follow: false } };

/** Страница ссылки из письма: вход по кнопке (ссылку могут заранее открыть почтовые проверки — так она не сгорит). */
export default async function LinkLoginPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <SiteShell>
      <div className="wrap">
        <div className="acc">
          <p className="kicker">Личный кабинет</p>
          <h1 className="order-h1">Вход по ссылке из письма</h1>
          <p className="acc-lead">Нажмите кнопку, чтобы открыть свои билеты на этом устройстве.</p>
          <LinkLoginForm token={token} />
          <p className="acc-small"><Link href="/account">Запросить новую ссылку</Link></p>
        </div>
      </div>
    </SiteShell>
  );
}
