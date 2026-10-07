import { formatSessionLong } from "@/lib/domain/moscow-time";
import { formatRub } from "@/lib/domain/pricing";
import { CANCEL_TERMS } from "@/lib/domain/refund-policy";
import { formatComposition } from "@/lib/domain/seats";
import { operator } from "@/lib/legal";

export type TicketData = {
  orderId: number;
  number: string;
  tourTitle: string;
  startsAt: Date;
  meetingPoint: string;
  whatToBring: string;
  children: number;
  adults: number;
  total: number;
  name: string;
  email: string;
  /** Ссылка на страницу заказа (билет). */
  url: string;
};

type Email = { subject: string; html: string; text: string };

// Цвета сайта. Письма — простые таблицы с инлайн-стилями: почтовые клиенты не читают <style> и CSS-переменные.
const BG = "#fbf6f0";
const INK = "#22293a";
const ACCENT = "#a34a2f";
const MUTED = "#6a6f7c";
const LINE = "#e6d9c8";
const FONT = "font-family:Arial,Helvetica,sans-serif";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
/** Экранирование с сохранением переносов строк (поля из textarea админки). */
const escLines = (s: string) => esc(s.trim()).replace(/\r\n|\r|\n/g, "<br>");

type Row = [label: string, value: string];

const paragraph = (html: string) => `<p style="margin:0 0 16px;${FONT};font-size:16px;line-height:1.5;color:${INK};">${html}</p>`;

function detailsTable(rows: Row[]): string {
  const cells = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:10px 12px 10px 0;border-bottom:1px solid ${LINE};width:36%;${FONT};font-size:13px;color:${MUTED};vertical-align:top;">${esc(k)}</td>` +
        `<td style="padding:10px 0;border-bottom:1px solid ${LINE};${FONT};font-size:15px;color:${INK};vertical-align:top;">${escLines(v)}</td></tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border-top:1px solid ${LINE};">${cells}</table>`;
}

function button(url: string, label: string): string {
  return (
    `<p style="margin:0 0 12px;"><a href="${esc(url)}" style="display:inline-block;padding:12px 24px;background:${ACCENT};color:#ffffff;${FONT};font-size:16px;font-weight:bold;text-decoration:none;border-radius:8px;">${esc(label)}</a></p>` +
    `<p style="margin:0 0 20px;${FONT};font-size:13px;line-height:1.4;color:${MUTED};">Если кнопка не открывается, скопируйте ссылку: <a href="${esc(url)}" style="color:${ACCENT};word-break:break-all;">${esc(url)}</a></p>`
  );
}

function section(title: string, body: string): string {
  return (
    `<h2 style="margin:0 0 8px;${FONT};font-size:15px;color:${INK};">${esc(title)}</h2>` +
    `<p style="margin:0 0 20px;${FONT};font-size:15px;line-height:1.5;color:${INK};">${escLines(body)}</p>`
  );
}

/** Контакты исполнителя из `legal.ts`; пустые поля пропускаются. */
const contactItems = () => [operator.phone, operator.email].map((s) => s.trim()).filter(Boolean);

function layout(title: string, content: string, footer: string[]): string {
  const foot = footer
    .map((f) => `<p style="margin:0 0 8px;${FONT};font-size:12px;line-height:1.5;color:${MUTED};">${esc(f)}</p>`)
    .join("");
  return (
    `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>` +
    `<body style="margin:0;padding:0;background:${BG};color:${INK};">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};"><tr><td align="center" style="padding:24px 12px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${LINE};border-radius:12px;"><tr><td style="padding:28px 28px 20px;">` +
    `<p style="margin:0 0 4px;${FONT};font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:${ACCENT};">Культурная Столица</p>` +
    `<h1 style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.25;font-weight:normal;color:${INK};">${esc(title)}</h1>` +
    content +
    `<div style="border-top:1px solid ${LINE};padding-top:16px;">${foot}</div>` +
    `</td></tr></table></td></tr></table></body></html>`
  );
}

/** Общий хвост писем: условия отмены (если нужны) и контакты. */
function footerLines(withTerms: boolean): string[] {
  const lines = withTerms ? [CANCEL_TERMS] : [];
  const contacts = contactItems();
  if (contacts.length) lines.push(`Контакты: ${contacts.join(" · ")}`);
  return lines;
}

const tourRows = (t: TicketData): Row[] => [
  ["Экскурсия", t.tourTitle],
  ["Дата и время", formatSessionLong(t.startsAt)],
];

export function ticketEmail(t: TicketData, kind: "paid" | "moved"): Email {
  const moved = kind === "moved";
  const subject = moved ? `Билет ${t.number} перенесён` : `Ваш билет ${t.number} — ${t.tourTitle}`;
  const heading = moved ? "Билет перенесён" : "Ваш билет";
  const intro = moved
    ? "Мы перенесли ваш билет на другое время — новые дата и время указаны ниже."
    : "Спасибо за покупку! Билет ниже — он же доступен на странице заказа, там его можно распечатать.";
  const receipt = "Кассовый чек придёт отдельным письмом от ЮKassa.";

  const rows: Row[] = [["Номер билета", t.number], ...tourRows(t)];
  if (t.meetingPoint.trim()) rows.push(["Место встречи", t.meetingPoint.trim()]);
  rows.push(["Состав", formatComposition(t.children, t.adults)], ["Сумма", formatRub(t.total)], ["Имя", t.name]);

  const bring = t.whatToBring.trim();
  const footer = footerLines(true);

  const html = layout(
    heading,
    paragraph(`Здравствуйте, ${esc(t.name)}!`) +
      paragraph(esc(intro)) +
      detailsTable(rows) +
      (bring ? section("Что взять с собой", bring) : "") +
      button(t.url, "Открыть билет") +
      (moved ? "" : paragraph(esc(receipt))),
    footer,
  );

  const text = [
    `Здравствуйте, ${t.name}!`,
    "",
    intro,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    ...(bring ? ["", "Что взять с собой:", bring] : []),
    "",
    `Билет на сайте: ${t.url}`,
    ...(moved ? [] : ["", receipt]),
    "",
    ...footer,
  ].join("\n");

  return { subject, html, text };
}

export function cancelledEmail(t: TicketData, refunded: number): Email {
  const subject = `Заказ ${t.number} отменён`;
  const lead = refunded > 0 ? `Ваш заказ ${t.number} отменён. Возвращаем вам ${formatRub(refunded)}.` : "Заказ отменён без возврата средств.";
  const note =
    refunded > 0 ? "Деньги вернутся тем же способом, которым вы платили, в течение нескольких дней — срок зависит от банка." : "";
  const rows: Row[] = [["Номер заказа", t.number], ...tourRows(t)];
  const footer = footerLines(false);

  const html = layout(
    "Заказ отменён",
    paragraph(`Здравствуйте, ${esc(t.name)}!`) + paragraph(esc(lead)) + (note ? paragraph(esc(note)) : "") + detailsTable(rows),
    footer,
  );
  const text = [`Здравствуйте, ${t.name}!`, "", lead, ...(note ? ["", note] : []), "", ...rows.map(([k, v]) => `${k}: ${v}`), "", ...footer].join("\n");

  return { subject, html, text };
}

export function sorryEmail(t: TicketData): Email {
  const subject = `Извините, места закончились — заказ ${t.number}`;
  const catalog = new URL("/#catalog", t.url).href;
  const lead = `К сожалению, пока ваш платёж обрабатывался, места на экскурсию «${t.tourTitle}» закончились. Возвращаем вам полную стоимость заказа — ${formatRub(t.total)}.`;
  const note = "Деньги вернутся тем же способом, которым вы платили, в течение нескольких дней — срок зависит от банка. Приносим извинения.";
  const rows: Row[] = [["Номер заказа", t.number], ...tourRows(t)];
  const footer = footerLines(false);

  const html = layout(
    "Извините, места закончились",
    paragraph(`Здравствуйте, ${esc(t.name)}!`) +
      paragraph(esc(lead)) +
      paragraph(esc(note)) +
      detailsTable(rows) +
      button(catalog, "Выбрать другую дату"),
    footer,
  );
  const text = [
    `Здравствуйте, ${t.name}!`, "", lead, "", note, "", ...rows.map(([k, v]) => `${k}: ${v}`), "", `Другие даты: ${catalog}`, "", ...footer,
  ].join("\n");

  return { subject, html, text };
}
