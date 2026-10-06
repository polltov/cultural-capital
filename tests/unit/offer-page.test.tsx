// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import OfferPage from "@/app/(site)/offer/page";
import { Footer } from "@/components/site/StaticSections";

afterEach(cleanup);

describe("OfferPage", () => {
  it("lists the cancellation rule and shows empty operator details as placeholders", () => {
    render(<OfferPage />);
    expect(screen.getByRole("heading", { name: "Договор-оферта на оказание экскурсионных услуг" })).toBeTruthy();
    expect(screen.getByText(/не позднее чем за 24 часа/)).toBeTruthy();
    expect(screen.getByText(/50%/)).toBeTruthy();
    // Пустые реквизиты видны как «[не заполнено]» — до публикации их нельзя пропустить.
    expect(screen.getAllByText(/\[не заполнено\]/).length).toBeGreaterThan(0);
  });

  it("has the eight sections in order", () => {
    render(<OfferPage />);
    const titles = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(titles).toEqual([
      "1. Общие положения",
      "2. Предмет договора",
      "3. Стоимость и оплата",
      "4. Билет",
      "5. Отмена и возврат",
      "6. Перенос",
      "7. Ответственность и разрешение споров",
      "8. Реквизиты исполнителя",
    ]);
  });
});

describe("Footer", () => {
  it("links to the offer first in the documents nav", () => {
    render(<Footer />);
    expect(screen.getByRole("link", { name: "Договор-оферта" }).getAttribute("href")).toBe("/offer");
    const links = Array.from(screen.getByRole("navigation", { name: "Документы" }).querySelectorAll("a"));
    expect(links[0].textContent).toBe("Договор-оферта");
  });
});
