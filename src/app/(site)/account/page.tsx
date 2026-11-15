import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/site/SiteShell";
import { RequestLinkForm } from "@/components/site/AccountForms";
import { getCustomerEmail } from "@/lib/auth/customer";
import { formatSessionLong } from "@/lib/domain/moscow-time";
import { formatRub } from "@/lib/domain/pricing";
import { formatComposition } from "@/lib/domain/seats";
import { listCustomerOrders, type AccountOrder } from "@/server/account";
import { logoutCustomerAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Мои билеты", robots: { index: false, follow: false } };

const STATUS: Record<AccountOrder["status"], string> = { paid: "Оплачен", done: "Экскурсия прошла", cancelled: "Отменён" };

function OrderRow({ o }: { o: AccountOrder }) {
  return (
    <li className="acc-order">
      <Link href={`/order/${o.accessToken}`} className="acc-order-link">
        <span className="acc-order-when">{formatSessionLong(o.startsAt)}</span>
        <span className="acc-order-title">{o.tourTitle}</span>
        <span className="acc-order-meta">
          {o.number} · {formatComposition(o.children, o.adults)} · {formatRub(o.total)}
          {o.refundedAmount > 0 && <> · возвращено {formatRub(o.refundedAmount)}</>}
          {" · "}
          <span className={`acc-status acc-status--${o.status}`}>{STATUS[o.status]}</span>
        </span>
      </Link>
    </li>
  );
}

/** Личный кабинет покупателя: вход по ссылке из письма, список заказов на этот email со ссылками на билеты. */
export default async function AccountPage() {
  const email = await getCustomerEmail();
  return (
    <SiteShell>
      <div className="wrap">
        <div className="acc">
          <p className="kicker">Личный кабинет</p>
          <h1 className="order-h1">Мои билеты</h1>
          {email ? <Orders email={email} /> : (
            <>
              <p className="acc-lead">Все ваши билеты в одном месте. Войти можно по ссылке, которую мы пришлём на почту, — пароль не нужен.</p>
              <RequestLinkForm />
            </>
          )}
        </div>
      </div>
    </SiteShell>
  );
}

async function Orders({ email }: { email: string }) {
  const { upcoming, past } = await listCustomerOrders(email);
  return (
    <>
      <div className="acc-who">
        <span>Вы вошли как <b>{email}</b></span>
        <form action={logoutCustomerAction}>
          <button type="submit" className="acc-logout">Выйти</button>
        </form>
      </div>
      {upcoming.length === 0 && past.length === 0 && (
        <p className="acc-lead">
          Заказов на этот адрес пока нет. <Link href="/afisha">Выбрать экскурсию в афише</Link>
        </p>
      )}
      {upcoming.length > 0 && (
        <section>
          <h2 className="acc-h2">Предстоящие</h2>
          <ul className="acc-orders">{upcoming.map((o) => <OrderRow key={o.number} o={o} />)}</ul>
        </section>
      )}
      {past.length > 0 && (
        <section>
          <h2 className="acc-h2">Прошедшие и отменённые</h2>
          <ul className="acc-orders acc-orders--past">{past.map((o) => <OrderRow key={o.number} o={o} />)}</ul>
        </section>
      )}
    </>
  );
}
