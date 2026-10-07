import { runNightly } from "@/server/nightly";

export const dynamic = "force-dynamic";

/**
 * Ночная задача (Vercel Cron, расписание в `vercel.ts`): Vercel вызывает GET с `Authorization: Bearer ${CRON_SECRET}`.
 * Без заданного секрета не пускаем никого: иначе заголовок «Bearer undefined» прошёл бы проверку.
 */
export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  return Response.json(await runNightly());
}
