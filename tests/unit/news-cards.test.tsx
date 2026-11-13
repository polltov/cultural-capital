// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NewsCards } from "@/components/site/NewsBlock";

afterEach(cleanup);

const item = (id: number) => ({
  id,
  slug: `n-${id}`,
  title: `Новость ${id}`,
  excerpt: "Коротко о главном.",
  coverUrl: null,
  publishedAt: new Date("2026-11-12T10:00:00+03:00"),
});
const items = (n: number) => Array.from({ length: n }, (_, i) => item(i + 1));
const gridClass = (container: HTMLElement) => container.firstElementChild?.className;

describe("NewsCards", () => {
  it("одна новость — широкая карточка с явным «Читать»", () => {
    const { container } = render(<NewsCards items={items(1)} />);
    expect(gridClass(container)).toBe("news-grid news-grid--1");
    expect(container.querySelector(".news-more")?.textContent).toContain("Читать");
    // «Читать» — украшение: ссылкой остаётся заголовок, и для скринридера она одна
    expect(container.querySelector(".news-more")?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("две новости делят ряд пополам, три и больше идут по три в ряд — без «Читать»", () => {
    const two = render(<NewsCards items={items(2)} />);
    expect(gridClass(two.container)).toBe("news-grid news-grid--2");
    expect(two.container.querySelector(".news-more")).toBeNull();
    cleanup();
    for (const n of [3, 4, 9]) {
      const { container } = render(<NewsCards items={items(n)} />);
      expect(gridClass(container), `${n} новостей`).toBe("news-grid");
      expect(container.querySelectorAll(".news-card")).toHaveLength(n);
      expect(container.querySelector(".news-more")).toBeNull();
      cleanup();
    }
  });

  it("заголовок карточки — ссылка на новость; уровень заголовка задаёт страница", () => {
    const home = render(<NewsCards items={items(1)} />);
    expect(screen.getByRole("heading", { level: 3, name: "Новость 1" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Новость 1" }).getAttribute("href")).toBe("/news/n-1");
    home.unmount();
    render(<NewsCards items={items(1)} level={2} />);
    expect(screen.getByRole("heading", { level: 2, name: "Новость 1" })).toBeTruthy();
  });
});
