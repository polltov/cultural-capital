import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  // Neon и Blob находятся во Франкфурте
  regions: ["fra1"],
};
