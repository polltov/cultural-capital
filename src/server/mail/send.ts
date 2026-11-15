import { createTransport } from "nodemailer";

export type Mail = { to: string; subject: string; html: string; text: string };

/** То, что нужно от транспорта nodemailer; в тестах подменяется. */
export type MailTransport = { sendMail(message: Record<string, unknown>): Promise<unknown> };

type Smtp = { host: string; port: number; user: string; pass: string };

/**
 * Настройки SMTP почтового сервиса из окружения (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`);
 * `null`, если почта не настроена. Порт по умолчанию 465 (сразу TLS), на других портах обязателен STARTTLS.
 */
export function smtpConfig(env: Record<string, string | undefined> = process.env): Smtp | null {
  const host = (env.SMTP_HOST ?? "").trim();
  const user = (env.SMTP_USER ?? "").trim();
  const pass = env.SMTP_PASSWORD ?? "";
  const port = Number((env.SMTP_PORT ?? "").trim() || 465);
  if (!host || !user || !pass || !Number.isInteger(port) || port <= 0) return null;
  return { host, port, user, pass };
}

export function smtpTransport(s: Smtp): MailTransport {
  return createTransport({
    host: s.host,
    port: s.port,
    secure: s.port === 465,
    requireTLS: s.port !== 465,
    auth: { user: s.user, pass: s.pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

/** Код и текст ошибки SMTP без пароля и тела письма. */
function describe(e: unknown): string {
  if (!(e instanceof Error)) return String(e).slice(0, 300);
  const x = e as Error & { code?: string; responseCode?: number };
  return [x.code, x.responseCode, x.message.slice(0, 300)].filter(Boolean).join(" ");
}

/**
 * Отправка письма через SMTP российского почтового сервиса (Яндекс 360, VK WorkSpace, Unisender Go и т. п.).
 * Никогда не бросает: `false` — почта не настроена (SMTP_* / MAIL_FROM, предупреждение) или отправка не удалась
 * (ошибка в лог). Пароль и тело письма в лог не попадают.
 */
export async function sendMail(m: Mail, transport?: MailTransport): Promise<boolean> {
  const from = (process.env.MAIL_FROM ?? "").trim();
  const smtp = smtpConfig();
  if (!from || (!transport && !smtp)) {
    console.warn("Почта не настроена: SMTP_HOST/SMTP_USER/SMTP_PASSWORD/MAIL_FROM не заданы");
    return false;
  }
  try {
    await (transport ?? smtpTransport(smtp!)).sendMail({ from, to: m.to, subject: m.subject, html: m.html, text: m.text });
    return true;
  } catch (e) {
    // Отказ сервера (неверный пароль, адрес отправителя не принадлежит ящику), сеть, таймаут.
    console.error("SMTP: письмо не отправлено:", describe(e));
    return false;
  }
}
