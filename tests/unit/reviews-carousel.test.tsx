// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ReviewsCarousel } from "@/components/site/ReviewsCarousel";
import { defaultSiteContent } from "@/lib/site-content";

const content = {
  ...defaultSiteContent.reviews,
  items: [
    { id: "one", name: "Анна", about: "", quote: "Понравилась экскурсия.", published: true },
    { id: "two", name: "Иван", about: "", quote: "Узнали много нового.", published: true },
  ],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it.each([[true, "instant"], [false, "smooth"]] as const)("учитывает настройку движения (%s)", (reduce, behavior) => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: reduce })));
  render(<ReviewsCarousel content={content} />);
  const track = screen.getByRole("list", { name: "Отзывы" });
  const scrollBy = vi.fn();
  Object.defineProperties(track, {
    clientWidth: { value: 300 },
    scrollWidth: { value: 600 },
    scrollBy: { value: scrollBy },
  });
  fireEvent.scroll(track);

  fireEvent.click(screen.getByRole("button", { name: "Предыдущий отзыв" }));
  expect(scrollBy).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Следующий отзыв" }));
  expect(scrollBy).toHaveBeenCalledWith(expect.objectContaining({ behavior }));
  expect(screen.queryByLabelText(/Оценка/)).toBeNull();
});
