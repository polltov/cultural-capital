import { z } from "zod";
import { parseMoscowLocal, toMoscowLocalInput } from "@/lib/domain/moscow-time";

export const INT4_MAX = 2_147_483_647;

/** Числа из форм приходят строками: пустая строка — «не число», а не 0. */
const num = (v: unknown) => (typeof v === "string" ? (v.trim() === "" ? Number.NaN : Number(v)) : v);

const text = (label: string, max: number) =>
  z.string({ error: `Заполните поле «${label}»` }).trim().max(max, `Не длиннее ${max} символов`);

const price = z.preprocess(
  num,
  z.number({ error: "Укажите цену" }).int("Цена — целое число рублей").min(0, "Цена не может быть отрицательной").max(1_000_000, "Слишком большая цена"),
);

export const tourSchema = z.object({
  title: z.string({ error: "Укажите название" }).trim().min(2, "Укажите название (не короче 2 символов)").max(120, "Не длиннее 120 символов"),
  subtitle: text("Подзаголовок", 120).default(""),
  route: text("Маршрут", 300).default(""),
  description: text("Описание", 5000).default(""),
  note: text("Примечание", 500).default(""),
  meetingPoint: text("Место встречи", 300).default(""),
  whatToBring: text("Что взять с собой", 500).default(""),
  durationLabel: text("Длительность", 40).min(1, "Укажите длительность"),
  ageLabel: text("Возраст", 10).min(1, "Укажите возраст"),
  priceChild: price,
  priceAdult: price,
  featured: z.boolean().default(false),
  coverUrl: z
    .string()
    .trim()
    .max(500, "Слишком длинная ссылка")
    .refine((v) => v === "" || /^(https:\/\/|\/)/.test(v), "Некорректная ссылка на фото")
    .nullish()
    .transform((v) => v || null),
});
export type TourInput = z.input<typeof tourSchema>;

export const idSchema = z.number().int().min(1).max(INT4_MAX);

export const sessionSchema = z.object({
  id: idSchema.optional(),
  tourId: idSchema,
  startsAt: z
    .string({ error: "Укажите дату и время" })
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Укажите дату и время")
    .refine((v) => {
      try {
        return toMoscowLocalInput(parseMoscowLocal(v)) === v;
      } catch {
        return false;
      }
    }, "Некорректная дата"),
  capacity: z.preprocess(num, z.number({ error: "Укажите лимит" }).int("Лимит — целое число").min(1, "Лимит от 1 до 100").max(100, "Лимит от 1 до 100")),
  hidden: z.boolean(),
});
export type SessionInput = z.input<typeof sessionSchema>;
