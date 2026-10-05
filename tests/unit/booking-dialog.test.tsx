// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("@/app/(site)/actions", () => ({ submitBooking: vi.fn(async () => ({ ok: false })) }));

import { BookingDialog } from "@/components/site/BookingDialog";
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
});

describe("maskPhone", () => {
  it("formats progressively", () => {
    expect(maskPhone("")).toBe("");
    expect(maskPhone("9")).toBe("+7 (9");
    expect(maskPhone("+7 (9")).toBe("+7 (9");
    expect(maskPhone("+7 (")).toBe("");
    expect(maskPhone("89211234567")).toBe("+7 (921) 123-45-67");
    expect(maskPhone("92112345678999")).toBe("+7 (921) 123-45-67");
  });
});
