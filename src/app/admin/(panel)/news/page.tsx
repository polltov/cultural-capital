import Link from "next/link";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/session";
import { listAllNews } from "@/server/news";
import { formatDateLong, formatDayMonth, formatTime } from "@/lib/domain/moscow-time";

export const metadata: Metadata = { title: "Новости" };

export default async function NewsAdminPage() {
  await requireAdmin();
  const rows = await listAllNews();
  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Новости</h1>
        <Link href="/admin/news/new" className="btn btn-accent">
          + Новая новость
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="empty">Новостей пока нет. Добавьте первую — она появится на сайте после публикации.</p>
      ) : (
        <ul className="nrows">
          {rows.map((r) => (
            <li key={r.id} className="nrow">
              <Link href={`/admin/news/${r.id}`} className="nrow-title">{r.title}</Link>
              <span className={`pill${r.publishedAt ? " pill--on" : ""}`}>
                {r.publishedAt ? `Опубликована ${formatDateLong(r.publishedAt)}` : "Черновик"}
              </span>
              <span className="muted nrow-upd">Обновлена {formatDayMonth(r.updatedAt)}, {formatTime(r.updatedAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
