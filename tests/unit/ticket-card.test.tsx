// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { TicketCard } from "@/components/site/TicketCard";

afterEach(cleanup);

const tour = {
  title: "T", subtitle: "s", route: "r", description: "Текст:\n\n- один\n- два", note: "",
  durationLabel: "2 часа", ageLabel: "6+", coverUrl: null, priceChild: 1390, priceAdult: 490, featured: false,
};
const d1 = new Date("2026-09-20T11:00:00+03:00");
const d2 = new Date("2026-10-04T11:00:00+03:00");

describe("TicketCard", () => {
  it("shows seats badge for nearest session", () => {
    render(<TicketCard tour={tour} sessions={[{ id: 1, startsAt: d1, free: 3 }]} />);
    expect(screen.getByText("осталось 3 места")).toBeTruthy();
  });
  it("no badge when >4 free, 'мест нет' when 0", () => {
    const { rerender } = render(<TicketCard tour={tour} sessions={[{ id: 1, startsAt: d1, free: 6 }]} />);
    expect(screen.queryByText(/осталось/)).toBeNull();
    rerender(<TicketCard tour={tour} sessions={[{ id: 1, startsAt: d1, free: 0 }]} />);
    expect(screen.getByText("мест нет")).toBeTruthy();
  });
  it("shows placeholder and disabled button without sessions", () => {
    render(<TicketCard tour={tour} sessions={[]} />);
    expect(screen.getByText("Даты уточняются")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Купить билет" }).getAttribute("aria-disabled")).toBe("true");
  });
  it("expands closed card on button click when no sessions, and does not call onBook", () => {
    const calls: (number | null)[] = [];
    const { container } = render(<TicketCard tour={tour} sessions={[]} onBook={(x) => calls.push(x)} />);
    fireEvent.click(screen.getByRole("button", { name: "Купить билет" }));
    expect(container.querySelector("article")!.className).toContain("open");
    fireEvent.click(screen.getByRole("button", { name: "Купить билет" }));
    expect(calls).toEqual([]);
  });
  it("shows date header and caption for two sessions", () => {
    const { container } = render(<TicketCard tour={tour} sessions={[{ id: 1, startsAt: d1, free: 8 }, { id: 2, startsAt: d2, free: 8 }]} />);
    expect(container.querySelector(".t-date b")?.textContent).toBe("20 сен / 4 окт");
    expect(container.querySelector(".t-date")?.textContent).toContain("вскр · 11:00");
  });
  it("does not render empty note, renders markdown list", () => {
    const { container } = render(<TicketCard tour={tour} sessions={[]} />);
    expect(container.querySelector(".t-note")).toBeNull();
    expect(container.querySelectorAll(".t-desc li")).toHaveLength(2);
  });
  it("resyncs selected chip when sessions change and calls onBook", () => {
    const calls: (number | null)[] = [];
    const s = (id: number, d: Date) => ({ id, startsAt: d, free: 8 });
    const { rerender, container } = render(<TicketCard tour={tour} sessions={[s(1, d1), s(2, d2)]} onBook={(x) => calls.push(x)} />);
    fireEvent.click(container.querySelectorAll(".t-date-chip")[1]);
    rerender(<TicketCard tour={tour} sessions={[s(3, d1), s(4, d2)]} onBook={(x) => calls.push(x)} />);
    expect(container.querySelector(".t-date-chip.active b")?.textContent).toBe("20 сен");
    fireEvent.click(container.querySelector("article")!);
    fireEvent.click(screen.getByRole("button", { name: "Купить билет" }));
    expect(calls).toEqual([3]);
  });
});
