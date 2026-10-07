import { z } from "zod";
import { normalizePhone } from "@/lib/domain/phone";

/** Поля формы оплаты. Email обязателен: на него ЮKassa шлёт чек, а мы — билет. */
export const checkoutSchema = z
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
      .string({ error: (iss) => (iss.input === undefined ? "Укажите email" : "Проверьте email") })
      .trim()
      .min(1, "Укажите email")
      .refine((v) => v === "" || z.email().safeParse(v).success, "Проверьте email"),
    consent: z.literal(true, { error: "Нужно согласие на обработку данных" }),
    website: z.string({ error: "Некорректное значение" }).optional().default(""),
  })
  .refine((v) => v.children + v.adults >= 1, {
    message: "Укажите хотя бы одного участника",
    path: ["children"],
  });

export type CheckoutInput = z.infer<typeof checkoutSchema>;

/** `holdSeconds` — сколько ещё держатся места, по часам сервера: клиент отсчитывает от момента ответа, а не от своих часов. */
export type CheckoutResult =
  | { ok: true; orderToken: string; confirmationToken: string; holdSeconds: number }
  | { ok: false; error?: string; fieldErrors?: Partial<Record<string, string>> };
