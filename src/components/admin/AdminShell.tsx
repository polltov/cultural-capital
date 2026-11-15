"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/admin/login/actions";
import { ROLE_LABELS, type Role } from "@/lib/auth/roles";

/** `guide` — пункт виден и гиду; остальные — только владельцу и администраторам. */
type Item = { href: string; label: string; icon: React.ReactNode; exact?: boolean; guide?: boolean; desktopOnly?: boolean };

const svg = (d: string) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

const ITEMS: Item[] = [
  { href: "/admin", label: "Сводка", exact: true, guide: true, icon: svg("M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-3H4zM14 7h6V4h-6z") },
  { href: "/admin/orders", label: "Заказы", icon: svg("M7 4h10l3 3v13H4V7zM8 11h8M8 15h5") },
  { href: "/admin/tours", label: "Экскурсии", icon: svg("M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z") },
  { href: "/admin/sources", label: "Источники", desktopOnly: true, icon: svg("M4 20V10M10 20V4M16 20v-7M22 20H2") },
  { href: "/admin/news", label: "Новости", icon: svg("M5 5h11v14H6a1 1 0 0 1-1-1zM16 9h3v9a1 1 0 0 1-1 1h-2M8 9h5M8 13h5") },
  { href: "/admin/faq", label: "Вопросы", icon: svg("M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.4 9.3a2.7 2.7 0 0 1 5.2.9c0 1.7-2.6 2.2-2.6 3.8M12 17h.01") },
  { href: "/admin/users", label: "Сотрудники", desktopOnly: true, icon: svg("M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7M22 21v-1a6 6 0 0 0-4-5.6") },
];

const LOGOUT_ICON = svg("M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10");

export function AdminShell({ newOrders, viewer, children }: { newOrders: number; viewer: { name: string; role: Role }; children: React.ReactNode }) {
  const pathname = usePathname();
  const items = viewer.role === "guide" ? ITEMS.filter((i) => i.guide) : ITEMS;
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
          {items.map((i) => (
            <Link key={i.href} href={i.href} className={`nav-item${active(i) ? " is-active" : ""}${i.desktopOnly ? " nav-item--desktop" : ""}`} aria-current={active(i) ? "page" : undefined}>
              {i.icon}
              <span className="nav-label">{i.label}</span>
              {i.href === "/admin/orders" && newOrders > 0 && (
                <span className="badge" aria-label={`новых: ${newOrders}`}>
                  {newOrders}
                </span>
              )}
            </Link>
          ))}
          <p className="side-who">
            {viewer.name}
            {viewer.name !== ROLE_LABELS[viewer.role] && <span className="muted"> · {ROLE_LABELS[viewer.role]}</span>}
          </p>
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
