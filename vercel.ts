import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  // Neon и Blob находятся во Франкфурте
  regions: ["fra1"],
  crons: [
    // Ночная задача платежей: 00:00 UTC = 03:00 по Москве
    { path: "/api/cron/nightly", schedule: "0 0 * * *" },
    // Дневная задача писем (напоминания накануне, «вы не завершили оплату»): 15:00 UTC = 18:00 по Москве
    { path: "/api/cron/daily", schedule: "0 15 * * *" },
  ],
};
