import { operator } from "./legal";
import { defaultSiteContent, type SiteContent } from "./site-content";

export const contacts = { ...defaultSiteContent.contacts };

export type ContactKind = "telegram" | "whatsapp" | "vk" | "phone" | "email";
export type ContactLink = { kind: ContactKind; label: string; value: string; href: string; external: boolean };

function vkHref(v: string): string {
  const path = v.trim().replace(/^(?:https?:\/\/)?(?:www\.)?vk\.com\//i, "").replace(/^@/, "").replace(/\/$/, "");
  return path ? `https://vk.com/${path}` : "";
}

/** «+7 999 123-45-67» → «tel:+79991234567»; 8 в начале российского номера заменяется на +7. */
function telHref(phone: string): string {
  let d = phone.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("8")) d = `7${d.slice(1)}`;
  return d ? `tel:+${d}` : "";
}

/** Все заполненные способы связи по порядку: мессенджеры, соцсеть, телефон, почта. */
export function contactLinks(settings: SiteContent["contacts"] = contacts): ContactLink[] {
  const out: ContactLink[] = [];
  const tg = settings.telegram.trim().replace(/^(?:@|https?:\/\/t\.me\/)/i, "").replace(/\/$/, "");
  if (tg) out.push({ kind: "telegram", label: "Telegram", value: `@${tg}`, href: `https://t.me/${tg}`, external: true });
  const wa = settings.whatsapp.replace(/\D/g, "");
  if (wa) out.push({ kind: "whatsapp", label: "WhatsApp", value: `+${wa}`, href: `https://wa.me/${wa}`, external: true });
  const vk = vkHref(settings.vk);
  if (vk) out.push({ kind: "vk", label: "ВКонтакте", value: vk.replace(/^https:\/\//, ""), href: vk, external: true });
  const phone = settings.phone.trim() || operator.phone.trim();
  const tel = telHref(phone);
  if (tel) out.push({ kind: "phone", label: "Телефон", value: phone, href: tel, external: false });
  const email = settings.email.trim() || operator.email.trim();
  if (email) out.push({ kind: "email", label: "Почта", value: email, href: `mailto:${email}`, external: false });
  return out;
}

export function writeUsHref(links = contactLinks()): string | null {
  return links.find(({ kind }) => kind !== "phone")?.href ?? null;
}

export const REQUEST_TOUR_LABEL = "Запросить экскурсию";

export function requestTourContact(links: ContactLink[]): ContactLink | undefined {
  return links.find(({ kind }) => kind !== "phone") ?? links[0];
}

/** Атрибуты внешней ссылки: мессенджеры и соцсети открываются в новой вкладке. */
export const externalProps = (href: string) => (href.startsWith("http") ? { target: "_blank", rel: "noopener" } : {});
