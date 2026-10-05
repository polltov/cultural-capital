"use server";

import { after } from "next/server";
import { headers } from "next/headers";
import { createOrder } from "@/server/orders";
import { notifyNewOrder } from "@/server/telegram";
import type { BookingResult } from "@/lib/validation/booking";

export async function submitBooking(_prev: BookingResult | null, formData: FormData): Promise<BookingResult> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "unknown";
  // Схема сама приводит числа из строк; consent: чекбокс даёт "on" → true.
  const input = {
    sessionId: formData.get("sessionId"),
    children: formData.get("children"),
    adults: formData.get("adults"),
    name: formData.get("name") ?? "",
    phone: formData.get("phone") ?? "",
    email: formData.get("email") ?? "",
    comment: formData.get("comment") ?? "",
    consent: formData.get("consent") === "on",
    website: formData.get("website") ?? "",
  };
  const result = await createOrder(input, ip);
  if (result.ok) after(() => notifyNewOrder(result.orderId));
  return result;
}
