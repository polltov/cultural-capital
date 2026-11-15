import { headers } from "next/headers";

/**
 * IP клиента для защиты от спама. Сайт доступен только через Caddy (deploy/Caddyfile), а тот записывает в
 * x-forwarded-for настоящий адрес посетителя, отбрасывая присланный им самим, и не пропускает его x-real-ip.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "unknown";
}
