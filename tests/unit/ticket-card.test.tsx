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
const d3 = new Date("2026-10-11T12:00:00+03:00");

describe("TicketCard", () => {
  it("shows seats badge for the nearest bookable session", () => {
    render(<TicketCard tour={tour} sessions={[{ id: 1, startsAt: d1, free: 3 }]} />);
    expect(screen.getByText("осталось 3 места")).toBeTruthy();
  });

  it("no badge when >4 free, 'мест нет' when everything is sold out", () => {
    const { rerender } = render(<TicketCard tour={tour} sessions={[{ id: 1, startsAt: d1, free: 6 }]} />);
    expect(screen.queryByText(/осталось/)).toBeNull();
    rerender(<TicketCard tour={tour} sessions={[{ id: 1, startsAt: d1, free: 0 }]} />);
    expect(screen.getByText("мест нет")).toBeTruthy();
  });

  it("without sessions: «Даты уточняются» and an inert buy label in the admin preview", () => {
    const { container } = render(<TicketCard tour={tour} sessions={[]} />);
    expect(screen.getByText("Даты уточняются")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.querySelector(".t-btn")?.getAttribute("aria-disabled")).toBe("true");
  });

  it("without bookable sessions on the site the button becomes a link to the tour page", () => {
    render(<TicketCard tour={tour} sessions={[{ id: 1, startsAt: d1, free: 0 }]} href="/tours/t" />);
    expect(screen.queryByRole("button", { name: "Купить билет" })).toBeNull();
    expect(screen.getByRole("link", { name: "Подробнее" }).getAttribute("href")).toBe("/tours/t");
  });

  it("books the nearest session that still has seats", () => {
    const calls: number[] = [];
    render(
      <TicketCard
        tour={tour}
        sessions={[{ id: 1, startsAt: d1, free: 0 }, { id: 2, startsAt: d2, free: 5 }, { id: 3, startsAt: d3, free: 8 }]}
        onBook={(x) => calls.push(x)}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Купить билет" }));
    expect(calls).toEqual([2]);
  });

  it("shows the bookable date, its weekday and time, and how many dates follow", () => {
    const { container } = render(
      <TicketCard tour={tour} sessions={[{ id: 1, startsAt: d1, free: 0 }, { id: 2, startsAt: d2, free: 8 }, { id: 3, startsAt: d3, free: 8 }]} />,
    );
    expect(container.querySelector(".t-date b")?.textContent).toBe("4 окт");
    expect(container.querySelector(".t-date")?.textContent).toContain("вскр · 11:00");
    expect(container.querySelector(".t-date em")?.textContent).toBe("и ещё 1 дата");
  });

  it("links the title to the tour page only when href is given", () => {
    const { rerender } = render(<TicketCard tour={tour} sessions={[]} href="/tours/t" />);
    expect(screen.getByRole("link", { name: "T" }).getAttribute("href")).toBe("/tours/t");
    rerender(<TicketCard tour={tour} sessions={[]} />);
    expect(screen.queryByRole("link", { name: "T" })).toBeNull();
  });

  it("shows the description and both prices only on the featured card", () => {
    const { container, rerender } = render(<TicketCard tour={tour} sessions={[]} />);
    expect(container.querySelector(".t-desc")).toBeNull();
    expect(container.querySelector(".t-price")?.textContent).toContain("детский · взрослый 490");
    rerender(<TicketCard tour={{ ...tour, featured: true }} sessions={[]} />);
    expect(container.querySelectorAll(".t-desc li")).toHaveLength(2);
    expect(Array.from(container.querySelectorAll(".t-prices dt")).map((d) => d.textContent)).toEqual(["Детский", "Взрослый"]);
  });

  it("uses the engraving cover when there is no photo, the given variant first", () => {
    const { container } = render(<TicketCard tour={tour} sessions={[]} coverVariant={2} />);
    expect(container.querySelector(".cover-art")?.className).toContain("cover-art--2");
    expect(container.querySelector("img")).toBeNull();
  });
});
