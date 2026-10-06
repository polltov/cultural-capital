const ENDPOINT = "https://api.resend.com/emails";
const TIMEOUT_MS = 10_000;

export type Mail = { to: string; subject: string; html: string; text: string };

/**
 * Отправка письма через Resend REST API. Никогда не бросает: `false` — почта не настроена
 * (RESEND_API_KEY/MAIL_FROM, предупреждение) или отправка не удалась (ошибка в лог).
 * Ключ и тело письма в лог не попадают.
 */
export async function sendMail(m: Mail, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!key || !from) {
    console.warn("Почта не настроена: RESEND_API_KEY/MAIL_FROM не заданы");
    return false;
  }
  try {
    const res = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [m.to], subject: m.subject, html: m.html, text: m.text }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("Resend: письмо не отправлено", res.status, detail.slice(0, 500));
      return false;
    }
    return true;
  } catch (e) {
    // Сеть, DNS, таймаут: HTTP-статуса нет.
    console.error("Resend: ошибка отправки письма", e);
    return false;
  }
}
