"use server";

import { revalidatePath } from "next/cache";
import { releaseHold, startCheckout } from "@/server/checkout";
import { clientIp } from "@/server/client-ip";
import type { CheckoutResult } from "@/lib/validation/checkout";

export async function startCheckoutAction(_prev: CheckoutResult | null, formData: FormData): Promise<CheckoutResult> {
  const ip = await clientIp();
  // Схема сама приводит числа из строк; consent: чекбокс даёт "on" → true.
  const input = {
    sessionId: formData.get("sessionId"),
    children: formData.get("children"),
    adults: formData.get("adults"),
    name: formData.get("name") ?? "",
    phone: formData.get("phone") ?? "",
    email: formData.get("email") ?? "",
    consent: formData.get("consent") === "on",
    website: formData.get("website") ?? "",
  };
  const result = await startCheckout(input, ip);
  // Удержание занимает места: каталог должен показать новый остаток сразу, а не через 5 минут.
  if (result.ok) revalidatePath("/");
  return result;
}

// Токен страницы заказа: 32 случайных байта в base64url.
const ORDER_TOKEN = /^[A-Za-z0-9_-]{43}$/;

export async function releaseHoldAction(orderToken: string): Promise<void> {
  // Серверное действие — публичный эндпоинт: аргумент приходит от клиента, типам TypeScript верить нельзя.
  if (typeof orderToken !== "string" || !ORDER_TOKEN.test(orderToken)) return;
  await releaseHold(orderToken);
  revalidatePath("/");
}
