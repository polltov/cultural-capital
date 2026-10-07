// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const { changeStatus, refundAction, moveAction, resendTicketAction, replace } = vi.hoisted(() => ({
  changeStatus: vi.fn(),
  refundAction: vi.fn(),
  moveAction: vi.fn(),
  resendTicketAction: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("@/app/admin/(panel)/orders/actions", () => ({ changeStatus, refundAction, moveAction, resendTicketAction }));
// Как в Next: `useRouter()` отдаёт один и тот же объект между рендерами.
const router = { replace };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { OrderActions } from "@/components/admin/OrderActions";
import type { OrderStatus } from "@/lib/domain/order-status";
import { formatRub } from "@/lib/domain/pricing";

beforeEach(() => {
  for (const f of [changeStatus, refundAction, moveAction, resendTicketAction, replace]) f.mockReset();
  changeStatus.mockResolvedValue({ ok: true });
  refundAction.mockResolvedValue({ ok: true });
  moveAction.mockResolvedValue({ ok: true });
  resendTicketAction.mockResolvedValue({ ok: true });
});
afterEach(cleanup);

const HOUR = 3600_000;
const targets = [
  { id: 11, startsAt: new Date("2026-10-18T11:00:00+03:00"), free: 5 },
  { id: 12, startsAt: new Date("2026-10-25T15:30:00+03:00"), free: 1 },
];

/** По умолчанию — оплаченный заказ на 3270 ₽, до начала 48 ч (не ближе и не дальше от границы в 24 ч). */
function setup(over: { status?: OrderStatus; startsInHours?: number; hasTicket?: boolean; moveTargets?: typeof targets } = {}) {
  return render(
    <OrderActions
      id={57}
      status={over.status ?? "paid"}
      total={3270}
      startsAt={new Date(Date.now() + (over.startsInHours ?? 48) * HOUR)}
      moveTargets={over.moveTargets ?? targets}
      hasTicket={over.hasTicket ?? true}
    />,
  );
}
// getByText схлопывает неразрывные пробелы из formatRub в обычные — ожидаемый текст приводим так же.
const plain = (text: string) => text.replace(/\s/g, " ");
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const buttonNames = () => screen.queryAllByRole("button").map((b) => b.textContent);
const amount = () => screen.getByLabelText(/Сумма возврата/) as HTMLInputElement;

describe("OrderActions: оплаченный заказ", () => {
  it("четыре кнопки по порядку", () => {
    setup();
    expect(buttonNames()).toEqual(["Отменить и вернуть", "Перенести", "Отметить проведённым", "Отправить билет повторно"]);
  });

  it("«Отметить проведённым» меняет статус на done и обновляет страницу", async () => {
    setup();
    click("Отметить проведённым");
    await waitFor(() => expect(changeStatus).toHaveBeenCalledWith(57, "done"));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/admin/orders/57?saved=1"));
  });
});

describe("OrderActions: возврат", () => {
  it("за 48 ч до начала предлагает полную сумму — 3270", () => {
    setup({ startsInHours: 48 });
    click("Отменить и вернуть");
    expect(amount().value).toBe("3270");
    expect(screen.getByRole("button", { name: `Вернуть ${formatRub(3270)}` })).toBeTruthy();
  });

  it("за 2 ч до начала предлагает половину — 1635", () => {
    setup({ startsInHours: 2 });
    click("Отменить и вернуть");
    expect(amount().value).toBe("1635");
    expect(screen.getByRole("button", { name: `Вернуть ${formatRub(1635)}` })).toBeTruthy();
  });

  it("показывает подсказку о правиле", () => {
    setup();
    click("Отменить и вернуть");
    expect(screen.getByText("По правилу: за 24 ч и раньше — 100%, позже — 50%")).toBeTruthy();
  });

  it("отправка вызывает refundAction(id, 1635) и обновляет страницу", async () => {
    setup({ startsInHours: 2 });
    click("Отменить и вернуть");
    click(`Вернуть ${formatRub(1635)}`);
    await waitFor(() => expect(refundAction).toHaveBeenCalledWith(57, 1635));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/admin/orders/57?saved=1"));
  });

  it("подпись кнопки следует за введённой суммой; можно вернуть 0", async () => {
    setup();
    click("Отменить и вернуть");
    fireEvent.change(amount(), { target: { value: "1000" } });
    expect(screen.getByRole("button", { name: `Вернуть ${formatRub(1000)}` })).toBeTruthy();
    fireEvent.change(amount(), { target: { value: "0" } });
    click(`Вернуть ${formatRub(0)}`);
    await waitFor(() => expect(refundAction).toHaveBeenCalledWith(57, 0));
  });

  it.each(["", "abc", "12,5", "-1", "3271"])("сумма «%s» — кнопка заблокирована, действие не вызывается", (value) => {
    setup();
    click("Отменить и вернуть");
    fireEvent.change(amount(), { target: { value } });
    const submit = screen.getByRole("button", { name: /^Вернуть/ }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(submit);
    expect(refundAction).not.toHaveBeenCalled();
    expect(screen.getByText(plain(`Сумма — целое число от 0 до ${formatRub(3270)}`))).toBeTruthy();
  });

  it("отказ возврата: ошибка, подсказка про кабинет ЮKassa, страница не перезагружается", async () => {
    refundAction.mockResolvedValue({ ok: false, error: "Возврат не прошёл: нет связи" });
    setup();
    click("Отменить и вернуть");
    click(/^Вернуть/);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Возврат не прошёл: нет связи");
    expect(alert.textContent).toContain(
      "Если возврат не проходит, оформите его в кабинете ЮKassa, затем снова нажмите «Отменить и вернуть» — сайт увидит возврат и закроет заказ.",
    );
    expect(alert.textContent).not.toMatch(/сумм\S* 0/);
    expect(replace).not.toHaveBeenCalled();
    // Диалог остаётся открытым: сумму можно поправить и повторить.
    expect(amount().value).toBe("3270");
  });

  it("отказ не из-за ЮKassa (заказ уже не оплачен) — только текст ошибки, без подсказки про кабинет", async () => {
    refundAction.mockResolvedValue({ ok: false, error: "Вернуть деньги можно только по оплаченному заказу" });
    setup();
    click("Отменить и вернуть");
    click(/^Вернуть/);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Вернуть деньги можно только по оплаченному заказу");
  });

  it("у других действий подсказки про кабинет ЮKassa нет", async () => {
    moveAction.mockResolvedValue({ ok: false, error: "В выбранном сеансе свободно 0, в заказе 3" });
    setup();
    click("Перенести");
    fireEvent.change(screen.getByLabelText("Новый сеанс"), { target: { value: "11" } });
    click("Перенести");
    expect((await screen.findByRole("alert")).textContent).not.toContain("кабинете ЮKassa");
  });

  it("«Назад» закрывает диалог без вызова действия", () => {
    setup();
    click("Отменить и вернуть");
    click("Назад");
    expect(screen.queryByLabelText(/Сумма возврата/)).toBeNull();
    expect(buttonNames()).toHaveLength(4);
    expect(refundAction).not.toHaveBeenCalled();
  });

  it("повторное открытие пересчитывает сумму заново", () => {
    setup();
    click("Отменить и вернуть");
    fireEvent.change(amount(), { target: { value: "1" } });
    click("Назад");
    click("Отменить и вернуть");
    expect(amount().value).toBe("3270");
  });
});

describe("OrderActions: перенос", () => {
  it("предлагает сеансы из listMoveTargets и вызывает moveAction(id, sessionId)", async () => {
    setup();
    click("Перенести");
    const select = screen.getByLabelText("Новый сеанс") as HTMLSelectElement;
    const options = [...select.options].map((o) => o.textContent);
    expect(options).toEqual(["Выберите сеанс", "18 окт, вскр, 11:00 · свободно 5", "25 окт, вскр, 15:30 · свободно 1"]);

    const submit = screen.getByRole("button", { name: "Перенести" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(select, { target: { value: "12" } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    await waitFor(() => expect(moveAction).toHaveBeenCalledWith(57, 12));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/admin/orders/57?saved=1"));
    // Заказ остался «Оплачен», страница та же: диалог должен закрыться сам, а не висеть с устаревшим выбором.
    expect(screen.queryByLabelText("Новый сеанс")).toBeNull();
    expect(buttonNames()).toHaveLength(4);
  });

  it("ошибка переноса показывается, диалог остаётся", async () => {
    moveAction.mockResolvedValue({ ok: false, error: "В выбранном сеансе свободно 0, в заказе 3" });
    setup();
    click("Перенести");
    fireEvent.change(screen.getByLabelText("Новый сеанс"), { target: { value: "11" } });
    click("Перенести");
    expect((await screen.findByRole("alert")).textContent).toBe("В выбранном сеансе свободно 0, в заказе 3");
    expect(screen.getByLabelText("Новый сеанс")).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it("без подходящих сеансов объясняет, что делать, и не даёт перенести", () => {
    setup({ moveTargets: [] });
    click("Перенести");
    expect(screen.getByText(/Нет подходящих сеансов/)).toBeTruthy();
    expect(screen.queryByLabelText("Новый сеанс")).toBeNull();
    expect(screen.queryByRole("button", { name: "Перенести" })).toBeNull();
  });
});

describe("OrderActions: повторная отправка билета", () => {
  it("вызывает resendTicketAction и сообщает об отправке", async () => {
    setup();
    click("Отправить билет повторно");
    await waitFor(() => expect(resendTicketAction).toHaveBeenCalledWith(57));
    expect((await screen.findByRole("status")).textContent).toBe("Билет отправлен на почту клиента");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("без настроенной почты показывает ошибку", async () => {
    resendTicketAction.mockResolvedValue({ ok: false, error: "Письмо не отправлено — проверьте настройки почты" });
    setup();
    click("Отправить билет повторно");
    expect((await screen.findByRole("alert")).textContent).toBe("Письмо не отправлено — проверьте настройки почты");
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("OrderActions: остальные статусы", () => {
  it.each<OrderStatus>(["awaiting_payment", "expired", "cancelled"])("%s — кнопок нет", (status) => {
    const { container } = setup({ status });
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(container.textContent).toBe("");
  });

  it("проведённый заказ с билетом — только повторная отправка", () => {
    setup({ status: "done" });
    expect(buttonNames()).toEqual(["Отправить билет повторно"]);
  });

  it("проведённая старая заявка без билета — кнопок нет", () => {
    setup({ status: "done", hasTicket: false });
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

describe("OrderActions: старые заявки", () => {
  it("новая: «Подтвердить» и «Отменить»; отмена — с подтверждением", async () => {
    setup({ status: "new", hasTicket: false, moveTargets: [] });
    expect(buttonNames()).toEqual(["Подтвердить", "Отменить"]);
    click("Отменить");
    expect(screen.getByText("Отменить заявку? Места освободятся.")).toBeTruthy();
    expect(changeStatus).not.toHaveBeenCalled();
    click("Да, отменить");
    await waitFor(() => expect(changeStatus).toHaveBeenCalledWith(57, "cancelled"));
  });

  it("подтверждённая: «Отметить проведённым» и «Отменить»", () => {
    setup({ status: "confirmed", hasTicket: false, moveTargets: [] });
    expect(buttonNames()).toEqual(["Отметить проведённым", "Отменить"]);
  });
});
