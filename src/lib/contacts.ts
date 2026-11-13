// Контакты для кнопки «Написать», меню, подвала и блока индивидуальных экскурсий. Заполняет владелец сайта.
// Кнопка «Написать» ведёт в первое заполненное: Telegram, WhatsApp, почта оператора из legal.ts.
// Если пусто всё, кнопок нет: лучше без них, чем с кнопкой, которая ничего не делает.
// Телефон и почта берутся из реквизитов оператора (legal.ts), чтобы не вводить их дважды.

import { operator } from "./legal";

export const contacts = {
  /** Имя в Telegram без @, например «kultstolica». */
  telegram: "",
  /** Номер для WhatsApp, только цифры с кодом страны, например «79991234567». */
  whatsapp: "",
  /** Сообщество ВКонтакте: короткое имя, например «kultstolica», или полная ссылка. */
  vk: "",
};

export type ContactKind = "telegram" | "whatsapp" | "vk" | "phone" | "email";
export type ContactLink = { kind: ContactKind; label: string; value: string; href: string; external: boolean };

const telegramHandle = () => contacts.telegram.trim().replace(/^@/, "").replace(/^https?:\/\/t\.me\//i, "");
const whatsappDigits = () => contacts.whatsapp.replace(/\D/g, "");

function vkHref(v: string): string {
  const s = v.trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  return `https://vk.com/${s.replace(/^@/, "").replace(/^vk\.com\//i, "")}`;
}

/** «+7 999 123-45-67» → «tel:+79991234567»; 8 в начале российского номера заменяется на +7. */
function telHref(phone: string): string {
  let d = phone.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("8")) d = `7${d.slice(1)}`;
  return d ? `tel:+${d}` : "";
}

/** Все заполненные способы связи по порядку: мессенджеры, соцсеть, телефон, почта. */
export function contactLinks(): ContactLink[] {
  const out: ContactLink[] = [];
  const tg = telegramHandle();
  if (tg) out.push({ kind: "telegram", label: "Telegram", value: `@${tg}`, href: `https://t.me/${tg}`, external: true });
  const wa = whatsappDigits();
  if (wa) out.push({ kind: "whatsapp", label: "WhatsApp", value: `+${wa}`, href: `https://wa.me/${wa}`, external: true });
  const vk = vkHref(contacts.vk);
  if (vk) out.push({ kind: "vk", label: "ВКонтакте", value: vk.replace(/^https?:\/\/(www\.)?/i, ""), href: vk, external: true });
  const tel = telHref(operator.phone);
  if (tel) out.push({ kind: "phone", label: "Телефон", value: operator.phone.trim(), href: tel, external: false });
  const email = operator.email.trim();
  if (email) out.push({ kind: "email", label: "Почта", value: email, href: `mailto:${email}`, external: false });
  return out;
}

export function writeUsHref(): string | null {
  const tg = telegramHandle();
  if (tg) return `https://t.me/${tg}`;
  const wa = whatsappDigits();
  if (wa) return `https://wa.me/${wa}`;
  const email = operator.email.trim();
  if (email) return `mailto:${email}`;
  return null;
}

/** Атрибуты внешней ссылки: мессенджеры и соцсети открываются в новой вкладке. */
export const externalProps = (href: string) => (href.startsWith("http") ? { target: "_blank", rel: "noopener" } : {});
