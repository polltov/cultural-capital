import { z } from "zod";
import { slugify } from "@/lib/domain/slug";

export const newsSchema = z.object({
  title: z.string({ error: "Укажите заголовок" }).trim().min(2, "Заголовок не короче 2 символов").max(160, "Не длиннее 160 символов"),
  slug: z
    .string()
    .default("")
    .transform((v) => slugify(v))
    .refine((v) => v.length <= 120, "Не длиннее 120 символов"),
  excerpt: z.string({ error: "Заполните анонс" }).trim().max(300, "Анонс не длиннее 300 символов").default(""),
  body: z.string({ error: "Заполните текст" }).max(50000, "Текст не длиннее 50 000 символов").default(""),
  coverUrl: z
    .string()
    .trim()
    .max(500, "Слишком длинная ссылка")
    .refine((v) => v === "" || /^(https:\/\/|\/)/.test(v), "Некорректная ссылка на фото")
    .nullish()
    .transform((v) => v || null),
});
export type NewsInput = z.input<typeof newsSchema>;
