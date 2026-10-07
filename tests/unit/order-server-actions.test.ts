import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAdmin, refundOrder, moveOrder, sendTicket, sendCancelled, revalidatePath, after } = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  refundOrder: vi.fn(),
  moveOrder: vi.fn(),
  sendTicket: vi.fn(),
  sendCancelled: vi.fn(),
  revalidatePath: vi.fn(),
  after: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ requireAdmin }));
vi.mock("@/server/refunds", () => ({ refundOrder, moveOrder }));
vi.mock("@/server/ticket", () => ({ sendTicket, sendCancelled }));
vi.mock("@/server/orders", () => ({ setAdminNote: vi.fn(), transitionOrder: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/server", () => ({ after }));

import { moveAction, refundAction, resendTicketAction } from "@/app/admin/(panel)/orders/actions";

const BAD = { ok: false, error: "Некорректный запрос" };

beforeEach(() => {
  for (const f of [requireAdmin, refundOrder, moveOrder, sendTicket, sendCancelled, revalidatePath, after]) f.mockReset();
  requireAdmin.mockResolvedValue(undefined);
  sendCancelled.mockResolvedValue(true);
  sendTicket.mockResolvedValue(true);
});

/** Письма откладываются через `after()`: достаём последний переданный колбэк и запускаем его. */
async function runAfter() {
  expect(after).toHaveBeenCalledTimes(1);
  await after.mock.calls[0][0]();
}

describe("refundAction", () => {
  it("успех: возврат, обновление страниц и письмо об отмене после ответа", async () => {
    refundOrder.mockResolvedValue({ ok: true });
    expect(await refundAction(57, 1635)).toEqual({ ok: true });
    expect(refundOrder).toHaveBeenCalledWith(57, 1635);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/orders/57");
    expect(sendCancelled).not.toHaveBeenCalled(); // письмо — только в after()
    await runAfter();
    expect(sendCancelled).toHaveBeenCalledWith(57);
  });

  it("отказ возврата: ошибка возвращается как есть, писем и revalidate нет", async () => {
    refundOrder.mockResolvedValue({ ok: false, error: "Возврат не прошёл: нет связи" });
    expect(await refundAction(57, 1635)).toEqual({ ok: false, error: "Возврат не прошёл: нет связи" });
    expect(after).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("сумма 0 допустима (отмена без возврата)", async () => {
    refundOrder.mockResolvedValue({ ok: true });
    expect(await refundAction(57, 0)).toEqual({ ok: true });
    expect(refundOrder).toHaveBeenCalledWith(57, 0);
  });

  it.each([
    ["дробная сумма", 57, 10.5],
    ["NaN", 57, Number.NaN],
    ["Infinity", 57, Number.POSITIVE_INFINITY],
    ["id = 0", 0, 100],
    ["дробный id", 1.5, 100],
    ["слишком большой id", 2_147_483_648, 100],
  ])("%s — «Некорректный запрос», без обращения к ЮKassa", async (_name, id, amount) => {
    expect(await refundAction(id, amount)).toEqual(BAD);
    expect(refundOrder).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
  });

  it("сначала requireAdmin: без входа ничего не выполняется", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(refundAction(57, 100)).rejects.toThrow("NEXT_REDIRECT");
    expect(refundOrder).not.toHaveBeenCalled();
  });
});

describe("moveAction", () => {
  it("успех: перенос и письмо с билетом «moved» после ответа", async () => {
    moveOrder.mockResolvedValue({ ok: true });
    expect(await moveAction(57, 12)).toEqual({ ok: true });
    expect(moveOrder).toHaveBeenCalledWith(57, 12);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/orders/57");
    expect(sendTicket).not.toHaveBeenCalled();
    await runAfter();
    expect(sendTicket).toHaveBeenCalledWith(57, "moved");
  });

  it("отказ переноса: письма нет", async () => {
    moveOrder.mockResolvedValue({ ok: false, error: "Этот сеанс недоступен для переноса" });
    expect(await moveAction(57, 12)).toEqual({ ok: false, error: "Этот сеанс недоступен для переноса" });
    expect(after).not.toHaveBeenCalled();
  });

  it.each([
    ["id заказа", 0, 12],
    ["id сеанса", 57, 1.5],
    ["id сеанса NaN", 57, Number.NaN],
  ])("неверный %s — «Некорректный запрос»", async (_name, id, sessionId) => {
    expect(await moveAction(id, sessionId)).toEqual(BAD);
    expect(moveOrder).not.toHaveBeenCalled();
  });

  it("сначала requireAdmin", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(moveAction(57, 12)).rejects.toThrow("NEXT_REDIRECT");
    expect(moveOrder).not.toHaveBeenCalled();
  });
});

describe("resendTicketAction", () => {
  it("отправляет билет «paid» сразу (не через after) и обновляет страницу", async () => {
    expect(await resendTicketAction(57)).toEqual({ ok: true });
    expect(sendTicket).toHaveBeenCalledWith(57, "paid");
    expect(after).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/admin/orders/57");
  });

  it("письмо не ушло — понятная ошибка про настройки почты", async () => {
    sendTicket.mockResolvedValue(false);
    expect(await resendTicketAction(57)).toEqual({ ok: false, error: "Письмо не отправлено — проверьте настройки почты" });
  });

  it("неверный id — «Некорректный запрос»", async () => {
    expect(await resendTicketAction(-1)).toEqual(BAD);
    expect(sendTicket).not.toHaveBeenCalled();
  });

  it("сначала requireAdmin", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(resendTicketAction(57)).rejects.toThrow("NEXT_REDIRECT");
    expect(sendTicket).not.toHaveBeenCalled();
  });
});
