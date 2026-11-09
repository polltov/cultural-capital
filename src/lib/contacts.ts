// Куда ведёт кнопка «Написать» в шапке и ссылка в подвале. Заполняет владелец сайта.
// Берётся первое заполненное: Telegram, WhatsApp, почта оператора из legal.ts.
// Если пусто всё, кнопки нет: лучше без неё, чем с кнопкой, которая ничего не делает.

import { operator } from "./legal";

export const contacts = {
  /** Имя в Telegram без @, например «kultstolica». */
  telegram: "",
  /** Номер для WhatsApp, только цифры с кодом страны, например «79991234567». */
  whatsapp: "",
};

export function writeUsHref(): string | null {
  const tg = contacts.telegram.trim().replace(/^@/, "");
  if (tg) return `https://t.me/${tg}`;
  const wa = contacts.whatsapp.replace(/\D/g, "");
  if (wa) return `https://wa.me/${wa}`;
  const email = operator.email.trim();
  if (email) return `mailto:${email}`;
  return null;
}
