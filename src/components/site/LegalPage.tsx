import Link from "next/link";
import { SiteShell } from "@/components/site/SiteShell";
import { LEGAL_EDITION, ogrnLabel, operator, or } from "@/lib/legal";

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <SiteShell>
      <div className="wrap">
        <div className="legal">
          <h1>{title}</h1>
          <p className="legal-meta">Редакция от {LEGAL_EDITION}</p>
          {children}
          <p className="legal-back"><Link href="/">← На главную</Link></p>
        </div>
      </div>
    </SiteShell>
  );
}

export function OperatorDetails() {
  return (
    <dl>
      <dt>Оператор</dt><dd>{or(operator.name)}</dd>
      <dt>ИНН</dt><dd>{or(operator.inn)}</dd>
      {operator.ogrn && (<><dt>{ogrnLabel(operator.name)}</dt><dd>{operator.ogrn}</dd></>)}
      <dt>Почтовый адрес</dt><dd>{or(operator.address)}</dd>
      <dt>Email</dt><dd>{operator.email ? <a href={`mailto:${operator.email}`}>{operator.email}</a> : or("")}</dd>
      {operator.phone && (<><dt>Телефон</dt><dd>{operator.phone}</dd></>)}
    </dl>
  );
}
