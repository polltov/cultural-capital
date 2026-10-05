"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/admin/login/actions";

type Item = { href: string; label: string; icon: React.ReactNode; exact?: boolean };

const svg = (d: string) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

const ITEMS: Item[] = [
  { href: "/admin", label: "Сводка", exact: true, icon: svg("M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-3H4zM14 7h6V4h-6z") },
  { href: "/admin/orders", label: "Заявки", icon: svg("M7 4h10l3 3v13H4V7zM8 11h8M8 15h5") },
  { href: "/admin/tours", label: "Экскурсии", icon: svg("M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z") },
  { href: "/admin/news", label: "Новости", icon: svg("M5 5h11v14H6a1 1 0 0 1-1-1zM16 9h3v9a1 1 0 0 1-1 1h-2M8 9h5M8 13h5") },
];

const LOGOUT_ICON = svg("M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10");

export function AdminShell({ newOrders, children }: { newOrders: number; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = (i: Item) => (i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(`${i.href}/`));

  return (
    <div className="shell">
      <aside className="side">
        <Link href="/admin" className="side-brand">
          Культурная
          <br />
          Столица
        </Link>
        <nav className="side-nav" aria-label="Разделы">
          {ITEMS.map((i) => (
            <Link key={i.href} href={i.href} className={`nav-item${active(i) ? " is-active" : ""}`} aria-current={active(i) ? "page" : undefined}>
              {i.icon}
              <span className="nav-label">{i.label}</span>
              {i.href === "/admin/orders" && newOrders > 0 && (
                <span className="badge" aria-label={`новых: ${newOrders}`}>
                  {newOrders}
                </span>
              )}
            </Link>
          ))}
          <form action={logoutAction} className="nav-logout">
            <button type="submit" className="nav-item">
              {LOGOUT_ICON}
              <span className="nav-label">Выйти</span>
            </button>
          </form>
        </nav>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
