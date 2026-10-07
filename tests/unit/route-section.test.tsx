// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Route } from "@/components/site/StaticSections";

afterEach(cleanup);

describe("Route", () => {
  it("describes online purchase in the first two steps", () => {
    render(<Route />);
    const steps = screen.getAllByRole("listitem");
    expect(steps).toHaveLength(6);

    expect(steps[0].querySelector("h3")?.textContent).toBe("Покупаете билет онлайн");
    expect(steps[0].querySelector("p")?.textContent).toBe("Выбираете дату и оплачиваете картой или по СБП.");
    expect(steps[1].querySelector("h3")?.textContent).toBe("Получаете билет на почту");
    expect(steps[1].querySelector("p")?.textContent).toBe("С точкой встречи, временем и списком, что взять с собой.");
  });

  it("keeps the remaining steps unchanged", () => {
    render(<Route />);
    const titles = screen.getAllByRole("listitem").map((li) => li.querySelector("h3")?.textContent);
    expect(titles.slice(2)).toEqual(["Приходите к старту", "Гуляете и играете", "Получаете фото", "Возвращаетесь снова"]);
  });
});
