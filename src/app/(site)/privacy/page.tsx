import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Footer } from "@/components/site/StaticSections";

export const metadata: Metadata = { title: "Политика обработки персональных данных — Культурная Столица" };

// TODO(юрист): заменить текст
export default function PrivacyPage() {
  return (
    <div className="mock">
      <SiteHeader />
      <main className="legal">
        <h1 className="stitle">Политика обработки персональных данных</h1>
        <p>
          Здесь будет текст политики обработки персональных данных. Мы собираем только данные, которые вы оставляете в форме записи
          (имя, телефон, email, комментарий), и используем их для связи с вами по заявке на экскурсию.
        </p>
        <p><Link href="/">← На главную</Link></p>
      </main>
      <Footer />
    </div>
  );
}
