// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";

vi.mock("@/app/(site)/actions", () => ({ startCheckoutAction: vi.fn(), releaseHoldAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { BookingProvider } from "@/components/site/Booking";
import { BookingPanel } from "@/components/site/BookingPanel";
import { ScheduleList } from "@/components/site/Schedule";
import { scheduleOf } from "@/lib/domain/schedule";
import type { CatalogTour } from "@/server/catalog";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
  // jsdom без IntersectionObserver: полоса покупки на телефоне просто остаётся скрытой
  globalThis.IntersectionObserver ??= class { observe() {} disconnect() {} unobserve() {} takeRecords() { return []; } root = null; rootMargin = ""; thresholds = []; } as unknown as typeof IntersectionObserver;
});
afterEach(cleanup);

const base = { subtitle: "", route: "", description: "", note: "", meetingPoint: "", whatToBring: "", durationLabel: "2 часа", ageLabel: "6+", coverUrl: null, featured: false };
const at = (s: string) => new Date(`${s}:00+03:00`);
const catalog: CatalogTour[] = [
  {
    tour: { ...base, id: 1, slug: "egypt", title: "Египетский зал", priceChild: 1390, priceAdult: 490 },
    sessions: [
      { id: 11, startsAt: at("2026-11-22T11:00"), free: 0, capacity: 8 },
      { id: 12, startsAt: at("2026-11-29T11:00"), free: 3, capacity: 8 },
    ],
  },
  {
    tour: { ...base, id: 2, slug: "fort", title: "Тайна крепости", subtitle: "детский квест", priceChild: 2200, priceAdult: 2200 },
    sessions: [{ id: 21, startsAt: at("2026-11-21T12:00"), free: 8, capacity: 8 }],
  },
];

const dialogTitle = () => document.querySelector("dialog.bk-dialog[open] #bk-title")?.textContent ?? null;
const checked = () => (document.querySelector("dialog.bk-dialog input[type=radio]:checked") as HTMLInputElement | null)?.value;

describe("ScheduleList", () => {
  it("lists sessions by date with price, seats and a link to the tour", () => {
    render(<BookingProvider catalog={catalog}><ScheduleList items={scheduleOf(catalog)} /></BookingProvider>);
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByRole("link", { name: "Тайна крепости" }).getAttribute("href")).toBe("/tours/fort");
    expect(rows[0].querySelector(".bill-date b")?.textContent).toBe("21");
    expect(rows[0].querySelector(".bill-seats")?.textContent).toBe("свободно 8");
    expect(rows[2].querySelector(".bill-seats")?.textContent).toBe("осталось 3 места");
  });

  it("disables sold-out rows and opens the purchase on the chosen session", () => {
    render(<BookingProvider catalog={catalog}><ScheduleList items={scheduleOf(catalog)} /></BookingProvider>);
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[1]).queryByRole("button")).toBeNull();
    expect(within(rows[1]).getByText("Мест нет", { selector: ".btn" })).toBeTruthy();

    fireEvent.click(within(rows[2]).getByRole("button", { name: /Купить билет: Египетский зал, 29 ноя/ }));
    expect(dialogTitle()).toBe("Египетский зал");
    expect(checked()).toBe("12");
  });
});

describe("BookingPanel", () => {
  const panel = (c: CatalogTour) =>
    render(<BookingProvider catalog={catalog}><BookingPanel tour={c.tour} sessions={c.sessions} fallback={<p>нет дат</p>} /></BookingProvider>);

  it("preselects the nearest date with seats, keeps sold-out dates disabled and buys the picked one", () => {
    panel(catalog[0]);
    const [sold, free] = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(sold.disabled).toBe(true);
    expect(free.checked).toBe(true);
    expect(screen.getAllByText("Детский").length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: "Купить билет" })[0]);
    expect(dialogTitle()).toBe("Египетский зал");
    expect(checked()).toBe("12");
  });

  it("sold out: still lists the dates as unavailable, shows the fallback instead of the buy button", () => {
    panel({ ...catalog[0], sessions: [{ id: 11, startsAt: at("2026-11-22T11:00"), free: 0, capacity: 8 }] });
    expect(screen.getByRole("group", { name: "Ближайшие даты" })).toBeTruthy();
    const [sold] = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(sold.disabled).toBe(true);
    expect(sold.checked).toBe(false);
    expect(screen.getByText("нет дат")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Купить билет" })).toBeNull();
  });

  it("no dates at all: only the prices and the fallback", () => {
    panel({ ...catalog[0], sessions: [] });
    expect(screen.queryByRole("group")).toBeNull();
    expect(screen.getByText("нет дат")).toBeTruthy();
  });

  it("shows a single «Билет» price when child and adult cost the same", () => {
    panel(catalog[1]);
    expect(Array.from(document.querySelectorAll(".booking-prices dt")).map((d) => d.textContent)).toEqual(["Билет"]);
  });
});
