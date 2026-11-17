import { z } from "zod";
import { defaultSiteContent as defaults, MAX_SITE_ITEMS, type SiteContent, type SiteSection } from "@/lib/site-content";

const text = (max: number, fallback = "") => z.string().trim().max(max).transform((value) => value || fallback);
const title = (fallback: string) => text(160, fallback);
const body = (fallback: string) => text(1200, fallback);

const photo = (fallback: SiteContent["hero"]["mainPhoto"]) => z.object({
  url: text(512, fallback.url),
  alt: title(""),
  caption: title(""),
}).transform((value) => value.url === fallback.url ? {
  ...value, alt: value.alt || fallback.alt, caption: value.caption || fallback.caption,
} : value).refine(({ alt }) => alt.length > 0);

const itemId = z.string().regex(/^[a-z0-9-]{1,50}$/);
const list = <T extends { id: string }>(item: z.ZodType<T>) =>
  z.array(item).max(MAX_SITE_ITEMS).refine((items) => new Set(items.map(({ id }) => id)).size === items.length);
const textItems = list(z.object({
  id: itemId,
  title: z.string().trim().min(1).max(160),
  body: text(1200),
}));

const optional = (schema: z.ZodType<string, string>) => z.union([z.literal(""), schema]);
const phone = z.string().regex(/^\+?[0-9 ().-]{7,30}$/)
  .refine((value) => /^\d{7,15}$/.test(value.replace(/\D/g, "")));

const schemas: { [K in SiteSection]: z.ZodType<SiteContent[K]> } = {
  hero: z.object({
    eyebrow: title(defaults.hero.eyebrow),
    title: title(defaults.hero.title),
    description: body(defaults.hero.description),
    catalogLabel: text(50, defaults.hero.catalogLabel),
    datesLabel: text(50, defaults.hero.datesLabel),
    group: title(defaults.hero.group),
    route: title(defaults.hero.route),
    ticket: title(defaults.hero.ticket),
    mainPhoto: photo(defaults.hero.mainPhoto),
    sidePhoto: photo(defaults.hero.sidePhoto),
  }),
  why: z.object({
    kicker: title(defaults.why.kicker),
    title: title(defaults.why.title),
    lead: body(defaults.why.lead),
    items: textItems,
  }),
  route: z.object({
    kicker: title(defaults.route.kicker),
    title: title(defaults.route.title),
    lead: body(defaults.route.lead),
    items: textItems,
  }),
  reviews: z.object({
    kicker: title(defaults.reviews.kicker),
    title: title(defaults.reviews.title),
    items: list(z.object({
      id: itemId,
      name: z.string().trim().min(1).max(80),
      about: text(120),
      quote: z.string().trim().min(1).max(1200),
      published: z.boolean(),
    })),
  }),
  privateTours: z.object({
    kicker: title(defaults.privateTours.kicker),
    title: title(defaults.privateTours.title),
    paragraph1: body(defaults.privateTours.paragraph1),
    paragraph2: body(defaults.privateTours.paragraph2),
  }),
  contacts: z.object({
    telegram: z.string().trim().pipe(optional(z.string().regex(/^(?:@|https?:\/\/t\.me\/)?[a-z0-9_]{1,32}\/?$/i))),
    whatsapp: z.string().trim().pipe(optional(phone.refine((value) => value.replace(/\D/g, "").length >= 8))),
    vk: z.string().trim().pipe(optional(z.string().regex(/^(?:@|(?:https?:\/\/)?(?:www\.)?vk\.com\/)?[a-z0-9_.-]{1,80}\/?$/i))),
    phone: z.string().trim().pipe(optional(phone)),
    email: z.string().trim().max(254).pipe(optional(z.email())),
  }),
  footer: z.object({ description: body(defaults.footer.description) }),
  seo: z.object({
    title: title(defaults.seo.title),
    description: text(350, defaults.seo.description),
    socialTitle: title(defaults.seo.socialTitle),
    socialDescription: text(350, defaults.seo.socialDescription),
  }),
};

function isSitePhoto(url: string, imagesUrl: string) {
  const base = imagesUrl.trim().replace(/\/+$/, "");
  const path = base && url.startsWith(`${base}/`) ? url.slice(base.length) : url;
  return /^\/(?:assets|site)\/[a-z0-9._/-]+$/i.test(path)
    && path.split("/").every((segment, index) => index === 0 || (segment && segment !== "." && segment !== ".."))
    && (path.startsWith("/assets/") ? path === url : path !== url);
}

export function parseSiteSection<K extends SiteSection>(
  section: K, input: unknown, imagesUrl = process.env.IMAGES_URL ?? "",
): SiteContent[K] | null {
  const result = schemas[section].safeParse(input);
  if (!result.success) return null;
  if (section === "hero") {
    const { mainPhoto, sidePhoto } = result.data as SiteContent["hero"];
    if (![mainPhoto, sidePhoto].every(({ url }) => isSitePhoto(url, imagesUrl))) return null;
  }
  return result.data;
}
