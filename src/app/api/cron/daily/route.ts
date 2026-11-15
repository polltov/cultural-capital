import { runDaily } from "@/server/daily";
import { notifyAlert } from "@/server/telegram";

export const dynamic = "force-dynamic";

/**
 * Дневная задача (Vercel Cron, расписание в `vercel.ts`): напоминания накануне и письма «вы не завершили оплату».
 * Защита та же, что у ночной: `Authorization: Bearer ${CRON_SECRET}`, без заданного секрета — 401 для всех.
 */
export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const report = await runDaily();
  if (report.failed > 0) await notifyAlert(`Дневная задача: не отправлено писем — ${report.failed}. Подробности в логах Vercel.`);
  return Response.json(report);
}
