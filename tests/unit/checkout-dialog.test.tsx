// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeAll, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";

const { startCheckoutAction, releaseHoldAction, refresh } = vi.hoisted(() => ({
  startCheckoutAction: vi.fn(),
  releaseHoldAction: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/app/(site)/actions", () => ({ startCheckoutAction, releaseHoldAction }));
// Как в Next: `useRouter()` отдаёт один и тот же объект между рендерами.
const router = { refresh };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { CheckoutDialog } from "@/components/site/CheckoutDialog";
import { formatRub } from "@/lib/domain/pricing";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
});

// Заглушка виджета ЮKassa: скрипт «загружен», если класс уже есть на window.
type WidgetOptions = { confirmation_token: string; return_url: string; customization?: unknown; error_callback?: (e: unknown) => void };
class FakeWidget {
  static instances: FakeWidget[] = [];
  /** Что лежало в #payment-form в момент render(): контейнер должен уже быть в DOM. */
  renderedInto: { id: string; found: boolean }[] = [];
  render = vi.fn(async (id: string) => { this.renderedInto.push({ id, found: !!document.getElementById(id) }); });
  destroy = vi.fn();
  constructor(public opts: WidgetOptions) { FakeWidget.instances.push(this); }
}

beforeEach(() => {
  FakeWidget.instances = [];
  window.YooMoneyCheckoutWidget = FakeWidget;
  startCheckoutAction.mockReset();
  releaseHoldAction.mockReset();
  releaseHoldAction.mockResolvedValue(undefined);
  refresh.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete window.YooMoneyCheckoutWidget;
});

const TOKEN = "t".repeat(43);
const tour = {
  id: 1, slug: "t", title: "Эрмитаж для детей", subtitle: "s", route: "r", description: "d", note: "",
  durationLabel: "2 часа", ageLabel: "6+", coverUrl: null, priceChild: 1000, priceAdult: 1270, featured: false,
};
const sessions = [
  { id: 1, startsAt: new Date("2026-10-04T11:00:00+03:00"), free: 0 },
  { id: 2, startsAt: new Date("2026-10-11T11:00:00+03:00"), free: 5 },
  { id: 3, startsAt: new Date("2026-10-18T11:00:00+03:00"), free: 3 },
];
// getByText схлопывает неразрывные пробелы из formatRub в обычные — ожидаемый текст приводим так же.
const plain = (text: string) => text.replace(/\s/g, " ");
const SUMMARY = plain(`Эрмитаж для детей · 11 окт, вскр, 11:00 · 2 детских + 1 взрослый · ${formatRub(3270)}`);
const PAY = `Перейти к оплате · ${formatRub(3270)}`;

const ok = (holdExpiresAt = new Date(Date.now() + 15 * 60_000).toISOString()) =>
  ({ ok: true as const, orderToken: TOKEN, confirmationToken: "ct-1", holdExpiresAt });

const radios = () => screen.getAllByRole("radio") as HTMLInputElement[];
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const input = (label: string | RegExp) => screen.getByLabelText(label) as HTMLInputElement;
const currentStep = () => document.querySelector('[aria-current="step"]')?.textContent;

const setup = (initial: number | null, s = sessions) =>
  render(<CheckoutDialog tour={tour} sessions={s} initialSessionId={initial} onClose={() => {}} />);

/** Дата 11 окт предвыбрана → «Билеты»: 2 детских + 1 взрослый → «Оплата». */
function toPayStep() {
  const view = setup(2);
  click("Далее");
  fireEvent.click(screen.getByLabelText("Детских: больше"));
  fireEvent.click(screen.getByLabelText("Детских: больше"));
  click("Далее");
  return view;
}
function fillValid() {
  fireEvent.change(input("Имя"), { target: { value: "Анна" } });
  fireEvent.change(input("Телефон"), { target: { value: "9991234567" } });
  fireEvent.change(input(/Email/), { target: { value: "anna@example.com" } });
  fireEvent.click(input(/Даю согласие/));
}
/** Нажимает «Перейти к оплате» и ждёт, пока действие отработает и виджет создастся. */
async function pay() {
  await act(async () => { click(PAY); });
  await waitFor(() => expect(FakeWidget.instances).toHaveLength(1));
}

describe("шаг «Дата»", () => {
  it("предвыбирает сеанс из карточки", () => {
    setup(3);
    expect(radios().find((r) => r.value === "3")!.checked).toBe(true);
    expect(currentStep()).toBe("Дата");
  });
  it("сеанс без мест неактивен и не предвыбирается; «Далее» неактивна без выбора", () => {
    setup(1);
    const r = radios();
    expect(r.find((x) => x.value === "1")!.disabled).toBe(true);
    expect(r.every((x) => !x.checked)).toBe(true);
    expect(screen.getByText(/мест нет/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Далее" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(r.find((x) => x.value === "2")!);
    expect((screen.getByRole("button", { name: "Далее" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("шаг «Билеты»", () => {
  it("итог считается по ценам: 2 детских + 1 взрослый = 3 270 ₽", () => {
    setup(2);
    click("Далее");
    expect(currentStep()).toBe("Билеты");
    expect(screen.getByText(plain(formatRub(1270)))).toBeTruthy(); // 1 взрослый по умолчанию
    fireEvent.click(screen.getByLabelText("Детских: больше"));
    fireEvent.click(screen.getByLabelText("Детских: больше"));
    expect(screen.getByText(plain(formatRub(3270)))).toBeTruthy();
  });
  it("сумма участников не больше свободных мест сеанса", () => {
    setup(3); // свободно 3, один взрослый по умолчанию
    click("Далее");
    const plusChild = screen.getByLabelText("Детских: больше") as HTMLButtonElement;
    fireEvent.click(plusChild);
    fireEvent.click(plusChild);
    expect(plusChild.disabled).toBe(true);
    expect((screen.getByLabelText("Взрослых: больше") as HTMLButtonElement).disabled).toBe(true);
  });
  it("«Назад» возвращает к дате с сохранённым выбором", () => {
    setup(3);
    click("Далее");
    click("Назад");
    expect(currentStep()).toBe("Дата");
    expect(radios().find((r) => r.value === "3")!.checked).toBe(true);
  });
});

describe("шаг «Оплата»", () => {
  it("показывает сводку, ссылки на согласие, политику и оферту и кнопку с суммой", () => {
    toPayStep();
    expect(currentStep()).toBe("Оплата");
    expect(screen.getByText(SUMMARY)).toBeTruthy();
    expect(screen.getByText("сюда придут билет и чек")).toBeTruthy();
    const href = (name: string | RegExp) => screen.getByRole("link", { name }).getAttribute("href");
    expect(href(/согласие на обработку персональных данных/)).toBe("/consent");
    expect(href("политикой")).toBe("/privacy");
    expect(href("договора-оферты")).toBe("/offer");
    expect(screen.getByRole("button", { name: PAY })).toBeTruthy();
  });

  it("ошибка поля показывается у поля, введённое не теряется", async () => {
    startCheckoutAction.mockResolvedValue({ ok: false, fieldErrors: { email: "Проверьте email" } });
    toPayStep();
    fillValid();
    await act(async () => { click(PAY); });

    const alert = await screen.findByText("Проверьте email");
    expect(alert.getAttribute("role")).toBe("alert");
    expect(input(/Email/).getAttribute("aria-invalid")).toBe("true");
    expect(input("Имя").value).toBe("Анна");
    expect(input("Телефон").value).toBe("+7 (999) 123-45-67");
    expect(input(/Email/).value).toBe("anna@example.com");
    expect(input(/Даю согласие/).checked).toBe(true);
    expect(currentStep()).toBe("Оплата");
    expect((screen.getByRole("button", { name: PAY }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("отправляет поля формы, согласие как «on» и honeypot", async () => {
    startCheckoutAction.mockResolvedValue({ ok: false, error: "Оплата временно недоступна. Попробуйте позже или позвоните нам." });
    const { container } = toPayStep();
    fillValid();
    await act(async () => { click(PAY); });

    expect(startCheckoutAction).toHaveBeenCalledTimes(1);
    const [prev, fd] = startCheckoutAction.mock.calls[0] as [unknown, FormData];
    expect(prev).toBeNull();
    expect(Object.fromEntries(fd.entries())).toEqual({
      sessionId: "2", children: "2", adults: "1", name: "Анна", phone: "+7 (999) 123-45-67",
      email: "anna@example.com", consent: "on", website: "",
    });
    expect(container.querySelector('input[name="website"]')).toBeTruthy();
    expect((await screen.findByText(/Оплата временно недоступна/)).getAttribute("role")).toBe("alert");
  });

  // Review Focus 1: оба клика приходят до перерисовки, поэтому одной блокировки кнопки через pending мало.
  it("два быстрых клика «Перейти к оплате» вызывают startCheckoutAction один раз", async () => {
    startCheckoutAction.mockImplementation(() => new Promise(() => {}));
    toPayStep();
    fillValid();
    const button = screen.getByRole("button", { name: PAY });
    act(() => { button.click(); button.click(); });
    expect(startCheckoutAction).toHaveBeenCalledTimes(1);
    expect((await screen.findByRole("button", { name: /Переходим к оплате/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("после сбоя сети кнопка снова доступна, введённое не теряется", async () => {
    startCheckoutAction.mockRejectedValueOnce(new Error("fetch failed"));
    toPayStep();
    fillValid();
    await act(async () => { click(PAY); });

    expect((await screen.findByText(/Не удалось отправить/)).getAttribute("role")).toBe("alert");
    expect(input("Имя").value).toBe("Анна");
    startCheckoutAction.mockResolvedValueOnce(ok());
    await pay();
    expect(startCheckoutAction).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["Осталось мест: 2"],
    ["Мест не осталось"],
  ])("ошибка «%s» переводит на шаг «Билеты» и обновляет каталог", async (error) => {
    startCheckoutAction.mockResolvedValue({ ok: false, error });
    toPayStep();
    fillValid();
    await act(async () => { click(PAY); });

    const alert = await screen.findByText(error);
    expect(alert.getAttribute("role")).toBe("alert");
    expect(currentStep()).toBe("Билеты");
    expect(refresh).toHaveBeenCalledTimes(1);
    // Введённое на следующем шаге не потеряно.
    click("Далее");
    expect(input("Имя").value).toBe("Анна");
    expect(screen.queryByText(error)).toBeNull();
  });

  it("«Назад» возвращает к билетам", () => {
    toPayStep();
    click("Назад");
    expect(currentStep()).toBe("Билеты");
  });
});

describe("виджет оплаты", () => {
  it("после ok: поля только для чтения, таймер, виджет получает токен и return_url", async () => {
    startCheckoutAction.mockResolvedValue(ok());
    toPayStep();
    fillValid();
    await pay();

    expect(document.getElementById("payment-form")).toBeTruthy();
    const w = FakeWidget.instances[0];
    expect(w.opts.confirmation_token).toBe("ct-1");
    expect(w.opts.return_url).toBe(`${location.origin}/order/${TOKEN}`);
    expect(w.opts.customization).toEqual({ colors: { control_primary: "#a34a2f" } });
    expect(w.renderedInto).toEqual([{ id: "payment-form", found: true }]);

    expect(screen.getByText(/Места за вами ещё 15:00/)).toBeTruthy();
    for (const l of ["Имя", "Телефон", /Email/]) expect(input(l).readOnly).toBe(true);
    expect(input(/Даю согласие/).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: PAY })).toBeNull();
    expect(screen.getByText(SUMMARY)).toBeTruthy();
  });

  it("сводка не меняется, когда каталог пересчитал места под удержание", async () => {
    startCheckoutAction.mockResolvedValue(ok());
    const { rerender } = toPayStep();
    fillValid();
    await pay();

    // revalidatePath("/") после покупки: свободных мест у сеанса стало 2 (5 − 3), у другого — без изменений.
    const after = sessions.map((s) => (s.id === 2 ? { ...s, free: 2 } : s));
    rerender(<CheckoutDialog tour={tour} sessions={after} initialSessionId={2} onClose={() => {}} />);
    expect(screen.getByText(SUMMARY)).toBeTruthy();
    expect(FakeWidget.instances).toHaveLength(1);
    expect(FakeWidget.instances[0].destroy).not.toHaveBeenCalled();
  });

  it("таймер идёт к holdExpiresAt; на нуле виджет убирается, «Начать заново» освобождает места и возвращает форму", async () => {
    vi.useFakeTimers();
    startCheckoutAction.mockResolvedValue(ok());
    toPayStep();
    fillValid();
    await act(async () => { click(PAY); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const w = FakeWidget.instances[0];
    expect(screen.getByText(/Места за вами ещё 15:00/)).toBeTruthy();

    await act(async () => { await vi.advanceTimersByTimeAsync(61_000); });
    expect(screen.getByText(/Места за вами ещё 13:59/)).toBeTruthy();
    expect(w.destroy).not.toHaveBeenCalled();

    await act(async () => { await vi.advanceTimersByTimeAsync(13 * 60_000 + 59_000); });
    expect(screen.getByText("Время на оплату истекло")).toBeTruthy();
    expect(w.destroy).toHaveBeenCalledTimes(1);
    expect(document.getElementById("payment-form")).toBeNull();
    expect(screen.queryByText(/Места за вами ещё/)).toBeNull();
    expect(releaseHoldAction).not.toHaveBeenCalled();

    await act(async () => { click("Начать заново"); });
    expect(releaseHoldAction).toHaveBeenCalledWith(TOKEN);
    expect(screen.queryByText("Время на оплату истекло")).toBeNull();
    expect(input("Имя").readOnly).toBe(false);
    expect(input("Имя").value).toBe("Анна");
    expect(input(/Email/).value).toBe("anna@example.com");
    expect(screen.getByRole("button", { name: PAY })).toBeTruthy();
  });

  it("«← Изменить» освобождает места, убирает виджет и возвращает редактируемую форму", async () => {
    startCheckoutAction.mockResolvedValue(ok());
    toPayStep();
    fillValid();
    await pay();

    await act(async () => { click(/Изменить/); });
    expect(releaseHoldAction).toHaveBeenCalledTimes(1);
    expect(releaseHoldAction).toHaveBeenCalledWith(TOKEN);
    expect(FakeWidget.instances[0].destroy).toHaveBeenCalledTimes(1);
    expect(document.getElementById("payment-form")).toBeNull();
    for (const l of ["Имя", "Телефон", /Email/]) expect(input(l).readOnly).toBe(false);
    expect(input(/Даю согласие/).disabled).toBe(false);
    expect(input("Имя").value).toBe("Анна");
    expect(input(/Даю согласие/).checked).toBe(true);
    expect(screen.getByRole("button", { name: PAY })).toBeTruthy();
  });

  it("форма не становится редактируемой, пока места не освобождены", async () => {
    startCheckoutAction.mockResolvedValue(ok());
    toPayStep();
    fillValid();
    await pay();

    let release!: () => void;
    releaseHoldAction.mockImplementationOnce(() => new Promise<void>((r) => { release = r; }));
    act(() => { click(/Изменить/); });
    expect(input("Имя").readOnly).toBe(true);
    expect((screen.getByRole("button", { name: /Изменить/ }) as HTMLButtonElement).disabled).toBe(true);

    await act(async () => { release(); });
    expect(input("Имя").readOnly).toBe(false);
  });

  it("ошибка виджета: «Не удалось загрузить форму оплаты» и «Попробовать снова» (освобождение и новая отправка)", async () => {
    startCheckoutAction.mockResolvedValueOnce(ok()).mockResolvedValueOnce({ ...ok(), orderToken: "n".repeat(43), confirmationToken: "ct-2" });
    toPayStep();
    fillValid();
    await pay();

    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    act(() => FakeWidget.instances[0].opts.error_callback?.({ error: "invalid_token" }));
    errorLog.mockRestore();
    expect((await screen.findByText("Не удалось загрузить форму оплаты")).getAttribute("role")).toBe("alert");
    expect(FakeWidget.instances[0].destroy).toHaveBeenCalledTimes(1);
    expect(document.getElementById("payment-form")).toBeNull();

    await act(async () => { click("Попробовать снова"); });
    expect(releaseHoldAction).toHaveBeenCalledWith(TOKEN);
    expect(startCheckoutAction).toHaveBeenCalledTimes(2);
    const first = Object.fromEntries((startCheckoutAction.mock.calls[0][1] as FormData).entries());
    const second = Object.fromEntries((startCheckoutAction.mock.calls[1][1] as FormData).entries());
    expect(second).toEqual(first);
    await waitFor(() => expect(FakeWidget.instances).toHaveLength(2));
    expect(FakeWidget.instances[1].opts.confirmation_token).toBe("ct-2");
    expect(FakeWidget.instances[1].opts.return_url).toBe(`${location.origin}/order/${"n".repeat(43)}`);
    expect(screen.queryByText("Не удалось загрузить форму оплаты")).toBeNull();
  });

  it("при закрытии диалога виджет уничтожается", async () => {
    startCheckoutAction.mockResolvedValue(ok());
    const { unmount } = toPayStep();
    fillValid();
    await pay();
    unmount();
    expect(FakeWidget.instances[0].destroy).toHaveBeenCalledTimes(1);
  });
});
