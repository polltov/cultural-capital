import type { Metadata } from "next";
import Link from "next/link";
import { SiteEditor } from "@/components/admin/SiteEditor";
import { requireAccess } from "@/lib/auth/viewer";
import { getSiteContent } from "@/server/site-content";

export const metadata: Metadata = { title: "Сайт" };

export default async function SiteEditorPage() {
  await requireAccess("content");
  const { content, revisions } = await getSiteContent();
  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Сайт</h1>
        <Link className="btn btn-ghost" href="/" target="_blank" rel="noopener">Открыть сайт ↗</Link>
      </div>
      <p className="muted section-sub">Каждый блок сохраняется отдельно. Сохранённые изменения сразу видны посетителям.</p>
      <SiteEditor content={content} revisions={revisions} />
    </>
  );
}
