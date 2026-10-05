import { z } from "zod";
import { normalizePhone } from "@/lib/domain/phone";

export const bookingSchema = z
  .object({
    sessionId: z.coerce
      .number({ error: "Выберите сеанс" })
      .int("Выберите сеанс")
      .positive("Выберите сеанс")
      .max(2147483647, "Выберите сеанс"),
    children: z.coerce
      .number({ error: "Укажите число участников" })
      .int("Укажите целое число")
      .min(0, "Число не может быть отрицательным")
      .max(20, "Не более 20 участников"),
    adults: z.coerce
      .number({ error: "Укажите число участников" })
      .int("Укажите целое число")
      .min(0, "Число не может быть отрицательным")
      .max(20, "Не более 20 участников"),
    name: z
      .string({ error: "Укажите имя" })
      .trim()
      .min(2, "Укажите имя")
      .max(80, "Слишком длинное имя"),
    phone: z.string({ error: "Проверьте номер телефона" }).transform((v, ctx) => {
      const p = normalizePhone(v);
      if (!p) {
        ctx.addIssue({ code: "custom", message: "Проверьте номер телефона" });
        return z.NEVER;
      }
      return p;
    }),
    email: z
      .string({ error: "Проверьте email" })
      .trim()
      .refine((v) => v === "" || z.email().safeParse(v).success, "Проверьте email")
      .optional(),
    comment: z.string({ error: "Проверьте комментарий" }).max(1000, "Не более 1000 символов").optional().default(""),
    consent: z.literal(true, { error: "Нужно согласие на обработку данных" }),
    website: z.string({ error: "Некорректное значение" }).optional().default(""),
  })
  .refine((v) => v.children + v.adults >= 1, {
    message: "Укажите хотя бы одного участника",
    path: ["children"],
  });

export type BookingInput = z.infer<typeof bookingSchema>;

export type BookingResult =
  | { ok: true; orderId: number; number: string }
  | { ok: false; error?: string; fieldErrors?: Partial<Record<string, string>> };
