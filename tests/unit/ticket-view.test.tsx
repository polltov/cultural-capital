// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { TicketView } from "@/components/site/TicketView";
import { formatRub } from "@/lib/domain/pricing";
import type { TicketData } from "@/server/mail/templates";

// Состояние «ждёт оплаты» рисует AwaitPayment (client, опрос через router.refresh()).
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

// Контакты в src/lib/legal.ts заполняет владелец; тест не должен зависеть от того, заполнены они или нет.
vi.mock("@/lib/legal", async (orig) => ({
  ...(await orig<typeof import("@/lib/legal")>()),
  operator: { name: "", inn: "", ogrn: "", address: "", email: "hello@example.test", phone: "+7 812 000-00-00" },
}));

afterEach(cleanup);

/** Testing Library сводит пробелы (в том числе неразрывные из `formatRub`) к обычным — ожидаемую строку приводим так же. */
const rub = (n: number) => formatRub(n).replace(/\s+/g, " ");

const ticket: TicketData = {
  orderId: 1, number: "КС-0057", tourTitle: "Эрмитаж для детей", startsAt: new Date("2026-10-12T11:00:00+03:00"),
  meetingPoint: "У главного входа", whatToBring: "Вода\nУдобная обувь", children: 2, adults: 1, total: 3270,
  name: "Анна", email: "anna@example.com", url: "https://x.test/order/tok",
};

describe("TicketView: оплачен", () => {
  it("показывает билет: номер на корешке, экскурсию, дату, место встречи, состав, сумму, имя", () => {
    const { container } = render(<TicketView view="paid" ticket={ticket} refunded={0} />);
    expect(container.querySelector(".t-stub")!.textContent).toBe("№ КС-0057");
    expect(screen.getByText("Эрмитаж для детей")).toBeTruthy();
    expect(screen.getByText("пн, 12 октября 2026, 11:00")).toBeTruthy();
    expect(screen.getByText("У главного входа")).toBeTruthy();
    expect(screen.getByText("2 детских + 1 взрослый")).toBeTruthy();
    expect(screen.getByText(rub(3270))).toBeTruthy();
    expect(screen.getByText("Анна")).toBeTruthy();
  });

  it("что взять с собой выводится с сохранением строк; пустое место встречи и список вещей скрываются", () => {
    const { container, rerender } = render(<TicketView view="paid" ticket={ticket} refunded={0} />);
    expect(container.querySelector(".order-bring")!.textContent).toContain("Вода");
    expect(container.querySelector(".order-bring")!.textContent).toContain("Удобная обувь");

    rerender(<TicketView view="paid" ticket={{ ...ticket, meetingPoint: " ", whatToBring: "" }} refunded={0} />);
    expect(screen.queryByText("Место встречи")).toBeNull();
    expect(screen.queryByText(/Что взять с собой/)).toBeNull();
  });

  it("есть кнопка «Распечатать», строка про чек, условия отмены и контакты", () => {
    render(<TicketView view="paid" ticket={ticket} refunded={0} />);
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    fireEvent.click(screen.getByRole("button", { name: "Распечатать" }));
    expect(print).toHaveBeenCalledTimes(1);

    expect(screen.getByText("Кассовый чек отправлен на email отдельным письмом от ЮKassa")).toBeTruthy();
    expect(screen.getByText(/не позднее чем за 24 часа до начала экскурсии/)).toBeTruthy();
    expect(screen.getByText(/hello@example\.test/)).toBeTruthy();
  });
});

describe("TicketView: отменён", () => {
  it("с возвратом — сумма возврата", () => {
    render(<TicketView view="cancelled" ticket={ticket} refunded={1635} />);
    expect(screen.getByRole("heading", { name: "Заказ отменён" })).toBeTruthy();
    expect(screen.getByText(new RegExp(`возврат ${rub(1635)} оформлен`))).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Распечатать" })).toBeNull();
  });

  it("без возврата — только «Заказ отменён»", () => {
    render(<TicketView view="cancelled" ticket={ticket} refunded={0} />);
    expect(screen.getByRole("heading", { name: "Заказ отменён" })).toBeTruthy();
    expect(screen.queryByText(/возврат/)).toBeNull();
  });
});

describe("TicketView: не оплачен", () => {
  it("«Время на оплату истекло» и ссылка «Выбрать дату заново» на каталог", () => {
    render(<TicketView view="expired" ticket={ticket} refunded={0} />);
    expect(screen.getByRole("heading", { name: "Время на оплату истекло" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Выбрать дату заново" }).getAttribute("href")).toBe("/#catalog");
    expect(screen.queryByRole("button", { name: "Распечатать" })).toBeNull();
  });
});

describe("TicketView: ждёт оплаты", () => {
  it("«Проверяем оплату…» без билета", () => {
    render(<TicketView view="awaiting" ticket={ticket} refunded={0} />);
    expect(screen.getByRole("heading", { name: "Проверяем оплату…" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Распечатать" })).toBeNull();
  });
});
