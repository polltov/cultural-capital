// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Faq } from "@/components/site/StaticSections";
import { contacts } from "@/lib/contacts";
import { operator } from "@/lib/legal";

afterEach(cleanup);

const items = [
  { id: 11, question: "Можно ли с собакой?", answer: "Да, **на поводке**." },
  { id: 12, question: "Есть ли туалет?", answer: "Первый абзац.\n\nВторой абзац:\n\n- раз\n- два" },
];

const shape = (el: Element) => Array.from(el.children).map((c) => `${c.tagName.toLowerCase()}.${c.className}`);

describe("Faq", () => {
  it("is a labelled section with the heading and a list of closed questions", () => {
    const { container } = render(<Faq items={items} />);
    const root = container.firstElementChild as HTMLElement;
    expect(`${root.tagName.toLowerCase()}#${root.id}`).toBe("section#faq");
    expect(screen.getByRole("region", { name: "Ответы на популярные вопросы" })).toBe(root);
    expect(root.querySelector(".stitle em")?.textContent).toBe("популярные вопросы");

    const list = root.querySelector(".faq-list")!;
    expect(shape(list)).toEqual(["details.faq-item", "details.faq-item"]);
    for (const d of Array.from(list.children)) {
      expect(d.hasAttribute("open")).toBe(false);
      expect(shape(d)).toEqual(["summary.", "div.answer"]);
    }
  });

  it("puts the question and a decorative plus in the summary", () => {
    const { container } = render(<Faq items={items} />);
    const summaries = Array.from(container.querySelectorAll("summary"));
    expect(summaries.map((s) => s.textContent)).toEqual(["Можно ли с собакой?", "Есть ли туалет?"]);
    const plus = summaries[0].querySelector(".plus")!;
    expect(plus.getAttribute("aria-hidden")).toBe("true");
  });

  it("renders each answer as Markdown directly inside div.answer", () => {
    const { container } = render(<Faq items={items} />);
    const [first, second] = Array.from(container.querySelectorAll(".faq-item > .answer"));
    expect(first.innerHTML).toBe("<p>Да, <strong>на поводке</strong>.</p>");
    expect(shape(second)).toEqual(["p.", "p.", "ul."]);
    expect(second.querySelectorAll("li")).toHaveLength(2);
  });

  it("offers to write only when there is somewhere to write", () => {
    const saved = { tg: contacts.telegram, email: operator.email };
    try {
      contacts.telegram = "";
      operator.email = "";
      render(<Faq items={items} />);
      expect(screen.queryByText(/Не нашли ответ/)).toBeNull();
      cleanup();
      contacts.telegram = "kultstolica";
      render(<Faq items={items} />);
      expect(screen.getByText(/Не нашли ответ/)).toBeTruthy();
      expect(screen.getByRole("link", { name: "Написать в Telegram" }).getAttribute("href")).toBe("https://t.me/kultstolica");
    } finally {
      contacts.telegram = saved.tg;
      operator.email = saved.email;
    }
  });

  it("renders nothing when there are no questions", () => {
    const { container } = render(<Faq items={[]} />);
    expect(container.innerHTML).toBe("");
  });
});
