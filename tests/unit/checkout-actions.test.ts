import { beforeEach, describe, expect, it, vi } from "vitest";

const { startCheckout, releaseHold, revalidatePath } = vi.hoisted(() => ({
  startCheckout: vi.fn(),
  releaseHold: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/server/checkout", () => ({ startCheckout, releaseHold }));
vi.mock("@/server/client-ip", () => ({ clientIp: async () => "9.9.9.9" }));
vi.mock("next/cache", () => ({ revalidatePath }));

import { releaseHoldAction, startCheckoutAction } from "@/app/(site)/actions";

const TOKEN = "Ab3_-".repeat(8) + "xyz"; // 43 символа base64url

beforeEach(() => {
  startCheckout.mockReset();
  releaseHold.mockReset();
  revalidatePath.mockReset();
});

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("startCheckoutAction", () => {
  const fields = { sessionId: "2", children: "2", adults: "1", name: "Анна", phone: "+7 (999) 123-45-67", email: "a@b.ru", consent: "on", website: "" };

  it("передаёт поля формы и IP клиента; consent «on» → true", async () => {
    startCheckout.mockResolvedValue({ ok: true, orderToken: TOKEN, confirmationToken: "ct", holdSeconds: 900 });
    await startCheckoutAction(null, form(fields));
    expect(startCheckout).toHaveBeenCalledWith({
      sessionId: "2", children: "2", adults: "1", name: "Анна", phone: "+7 (999) 123-45-67", email: "a@b.ru", consent: true, website: "",
    }, "9.9.9.9");
  });

  it("без чекбокса consent — false; пустые поля — пустые строки", async () => {
    startCheckout.mockResolvedValue({ ok: false });
    const rest: Record<string, string> = { ...fields };
    delete rest.consent;
    delete rest.name;
    await startCheckoutAction(null, form(rest));
    expect(startCheckout.mock.calls[0][0]).toMatchObject({ consent: false, name: "" });
  });

  it("успех обновляет каталог: удержание меняет число свободных мест", async () => {
    const result = { ok: true, orderToken: TOKEN, confirmationToken: "ct", holdSeconds: 900 };
    startCheckout.mockResolvedValue(result);
    expect(await startCheckoutAction(null, form(fields))).toEqual(result);
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("отказ и ошибки полей каталог не трогают и возвращаются как есть", async () => {
    startCheckout.mockResolvedValueOnce({ ok: false, error: "Осталось мест: 2" });
    expect(await startCheckoutAction(null, form(fields))).toEqual({ ok: false, error: "Осталось мест: 2" });
    startCheckout.mockResolvedValueOnce({ ok: false, fieldErrors: { email: "Проверьте email" } });
    expect(await startCheckoutAction(null, form(fields))).toEqual({ ok: false, fieldErrors: { email: "Проверьте email" } });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("releaseHoldAction", () => {
  it("освобождает места по токену и обновляет каталог", async () => {
    releaseHold.mockResolvedValue(undefined);
    await releaseHoldAction(TOKEN);
    expect(releaseHold).toHaveBeenCalledWith(TOKEN);
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  // Серверные действия — публичные эндпоинты: аргумент приходит от клиента как есть.
  it.each([
    ["пустая строка", ""],
    ["короче 43 символов", TOKEN.slice(1)],
    ["длиннее 43 символов", TOKEN + "a"],
    ["недопустимый символ", TOKEN.slice(1) + "="],
    ["пробел", TOKEN.slice(1) + " "],
    ["перевод строки в конце", TOKEN + "\n"],
    ["не строка (число)", 42 as unknown as string],
    ["не строка (объект)", { toString: () => TOKEN } as unknown as string],
    ["не строка (массив)", [TOKEN] as unknown as string],
    ["null", null as unknown as string],
    ["undefined", undefined as unknown as string],
  ])("%s: БД не трогаем", async (_name, bad) => {
    await releaseHoldAction(bad);
    expect(releaseHold).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
