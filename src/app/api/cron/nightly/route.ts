import { runNightly } from "@/server/nightly";
import { notifyAlert } from "@/server/telegram";

export const dynamic = "force-dynamic";

/**
 * Ночная задача (Vercel Cron, расписание в `vercel.ts`): Vercel вызывает GET с `Authorization: Bearer ${CRON_SECRET}`.
 * Без заданного секрета не пускаем никого: иначе заголовок «Bearer undefined» прошёл бы проверку.
 * Сбои по заказам задача только считает (подробности — в логах); владельцу о них — одна тревога в Telegram.
 */
export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const report = await runNightly();
  if (report.errors > 0) await notifyAlert(`Ночная задача: ошибок — ${report.errors}. Подробности в логах Vercel.`);
  return Response.json(report);
}
