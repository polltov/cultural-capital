import { ldJson } from "@/lib/seo";

/** Микроразметка schema.org на странице (рекомендация Next: обычный <script> в page/layout). */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(data) }} />;
}
