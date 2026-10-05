import { z } from "zod";
import { normalizePhone } from "@/lib/domain/phone";

export const bookingSchema = z
  .object({
    sessionId: z.coerce.number().int().positive(),
    children: z.coerce.number().int("Укажите целое число").min(0).max(20),
    adults: z.coerce.number().int("Укажите целое число").min(0).max(20),
    name: z.string().trim().min(2, "Укажите имя").max(80, "Слишком длинное имя"),
    phone: z.string().transform((v, ctx) => {
      const p = normalizePhone(v);
      if (!p) {
        ctx.addIssue({ code: "custom", message: "Проверьте номер телефона" });
        return z.NEVER;
      }
      return p;
    }),
    email: z.string().trim().email("Проверьте email").optional().or(z.literal("")),
    comment: z.string().max(1000, "Не более 1000 символов").optional().default(""),
    consent: z.literal(true, { error: "Нужно согласие на обработку данных" }),
    website: z.string().optional().default(""),
  })
  .refine((v) => v.children + v.adults >= 1, {
    message: "Укажите хотя бы одного участника",
    path: ["children"],
  });

export type BookingInput = z.infer<typeof bookingSchema>;

export type BookingResult =
  | { ok: true; orderId: number; number: string }
  | { ok: false; error?: string; fieldErrors?: Partial<Record<string, string>> };
