import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  // Neon и Blob находятся во Франкфурте
  regions: ["fra1"],
  // Ночная задача платежей: 00:00 UTC = 03:00 по Москве
  crons: [{ path: "/api/cron/nightly", schedule: "0 0 * * *" }],
};
