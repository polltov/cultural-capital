import { revalidatePublicSite } from "@/server/revalidate";

export const dynamic = "force-dynamic";

/**
 * Обновление страниц после выкладки: образ сайта собирается в GitHub Actions на пустой базе, поэтому главная, афиша и
 * карта сайта в нём без экскурсий. deploy/deploy.sh сразу после запуска вызывает POST с
 * `Authorization: Bearer ${CRON_SECRET}` и заходит на эти страницы — они перестраиваются с данными боевой базы.
 * Без заданного секрета не пускаем никого: иначе заголовок «Bearer undefined» прошёл бы проверку.
 */
export async function POST(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  revalidatePublicSite();
  return Response.json({ ok: true });
}
