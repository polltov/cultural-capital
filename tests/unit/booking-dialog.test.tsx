// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/app/(site)/actions", () => ({
  submitBooking: vi.fn(async () => ({ ok: false, fieldErrors: { phone: "Проверьте номер телефона" } })),
}));

import { BookingDialog } from "@/components/site/BookingDialog";
import { normalizePhone } from "@/lib/domain/phone";
import { maskPhone } from "@/lib/domain/phone-mask";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
});
afterEach(cleanup);

const tour = {
  id: 1, slug: "t", title: "Тур", subtitle: "s", route: "r", description: "d", note: "",
  durationLabel: "2 часа", ageLabel: "6+", coverUrl: null, priceChild: 1000, priceAdult: 500, featured: false,
};
const sessions = [
  { id: 1, startsAt: new Date("2026-10-04T11:00:00+03:00"), free: 0 },
  { id: 2, startsAt: new Date("2026-10-11T11:00:00+03:00"), free: 5 },
  { id: 3, startsAt: new Date("2026-10-18T11:00:00+03:00"), free: 3 },
];
const radios = () => screen.getAllByRole("radio") as HTMLInputElement[];
const setup = (initial: number | null) =>
  render(<BookingDialog tour={tour} sessions={sessions} initialSessionId={initial} onClose={() => {}} />);

describe("BookingDialog", () => {
  it("preselects the session passed in", () => {
    setup(3);
    expect(radios().find((r) => r.value === "3")!.checked).toBe(true);
  });
  it("disables sold-out session and never preselects it", () => {
    setup(1);
    const r = radios();
    expect(r.find((x) => x.value === "1")!.disabled).toBe(true);
    expect(r.find((x) => x.value === "2")!.checked).toBe(true);
    expect(screen.getByText(/мест нет/)).toBeTruthy();
  });
  it("recalculates total live", () => {
    setup(2);
    expect(screen.getByText(/500\s₽/)).toBeTruthy(); // 1 adult
    fireEvent.click(screen.getByLabelText("Детей: больше"));
    fireEvent.click(screen.getByLabelText("Взрослых: больше"));
    expect(screen.getByText(/2\s000\s₽/)).toBeTruthy(); // 1*1000 + 2*500
  });
  it("caps participants by free seats of selected session", () => {
    setup(3); // free 3, 1 adult by default
    const plusChild = screen.getByLabelText("Детей: больше") as HTMLButtonElement;
    fireEvent.click(plusChild);
    fireEvent.click(plusChild);
    expect(plusChild.disabled).toBe(true);
    expect((screen.getByLabelText("Взрослых: больше") as HTMLButtonElement).disabled).toBe(true);
  });
  it("keeps typed values after a server-side error", async () => {
    setup(2);
    fireEvent.change(screen.getByLabelText(/Имя/), { target: { value: "Анна" } });
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: "a@b.ru" } });
    fireEvent.change(screen.getByLabelText(/Комментарий/), { target: { value: "привет" } });
    fireEvent.click(screen.getByLabelText(/Даю согласие/));
    fireEvent.click(screen.getByRole("button", { name: "Записаться" }));
    await screen.findByText("Проверьте номер телефона");
    await waitFor(() => {
      expect((screen.getByLabelText(/Имя/) as HTMLInputElement).value).toBe("Анна");
      expect((screen.getByLabelText(/Email/) as HTMLInputElement).value).toBe("a@b.ru");
      expect((screen.getByLabelText(/Комментарий/) as HTMLTextAreaElement).value).toBe("привет");
      expect((screen.getByLabelText(/Даю согласие/) as HTMLInputElement).checked).toBe(true);
    });
  });
});

const typed = (str: string) => {
  let v = "";
  for (const c of str) v = maskPhone(v + c);
  return v;
};

describe("maskPhone", () => {
  it("formats progressively without trailing separators", () => {
    expect(maskPhone("")).toBe("");
    expect(maskPhone("9")).toBe("+7 (9");
    expect(maskPhone("+7 (9")).toBe("+7 (9");
    expect(maskPhone("+7 (921")).toBe("+7 (921");
    expect(maskPhone("+7 (9211")).toBe("+7 (921) 1");
    expect(maskPhone("92112345678999")).toBe("+7 (921) 123-45-67");
  });
  it("backspace always makes progress", () => {
    expect(maskPhone("+7 (921) ")).toBe("+7 (921");
    expect(maskPhone("+7 (921) 123-")).toBe("+7 (921) 123");
    expect(maskPhone("+7 (921) 123-45-")).toBe("+7 (921) 123-45");
    expect(maskPhone("+7 (9")).toBe("+7 (9");
    expect(maskPhone("+7 (")).toBe("+7 (");
    expect(maskPhone("+7 ")).toBe(""); // Backspace over "("
    expect(maskPhone("+")).toBe("");
  });
  it("treats first typed 7/8/+ as the prefix", () => {
    expect(typed("+74951234567")).toBe("+7 (495) 123-45-67");
    expect(typed("74951234567")).toBe("+7 (495) 123-45-67");
    expect(typed("84951234567")).toBe("+7 (495) 123-45-67");
    expect(typed("88121234567")).toBe("+7 (812) 123-45-67");
    expect(typed("9111234567")).toBe("+7 (911) 123-45-67");
    expect(typed("7")).toBe("+7 (");
  });
  it("handles pasted numbers", () => {
    expect(maskPhone("8121234567")).toBe("+7 (812) 123-45-67");
    expect(maskPhone("8 911 123-45-67")).toBe("+7 (911) 123-45-67");
    expect(maskPhone("+7 812 1234567")).toBe("+7 (812) 123-45-67");
    expect(maskPhone("89111234567")).toBe("+7 (911) 123-45-67");
  });
  it("complete results are accepted by normalizePhone", () => {
    for (const v of [typed("+74951234567"), typed("88121234567"), typed("9111234567"), maskPhone("8121234567"), maskPhone("8 911 123-45-67"), maskPhone("+7 812 1234567")]) {
      expect(normalizePhone(v)).toMatch(/^\+7\d{10}$/);
    }
  });
});
