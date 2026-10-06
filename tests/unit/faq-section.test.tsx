// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Faq } from "@/components/site/StaticSections";

afterEach(cleanup);

const items = [
  { id: 11, question: "Можно ли с собакой?", answer: "Да, **на поводке**." },
  { id: 12, question: "Есть ли туалет?", answer: "Первый абзац.\n\nВторой абзац:\n\n- раз\n- два" },
];

const shape = (el: Element) => Array.from(el.children).map((c) => `${c.tagName.toLowerCase()}.${c.className}`);

describe("Faq", () => {
  it("keeps the markup the site styles rely on", () => {
    const { container } = render(<Faq items={items} />);
    expect(container.children).toHaveLength(1);
    const root = container.firstElementChild as HTMLElement;
    expect(`${root.tagName.toLowerCase()}.${root.className}#${root.id}`).toBe("div.faq#faq");
    expect(shape(root)).toEqual(["div.faq-head", "div.faq-list"]);

    const head = root.querySelector(".faq-head")!;
    expect(shape(head)).toEqual(["div.kicker", "div.stitle"]);
    expect(head.querySelector(".kicker")?.textContent).toBe("Часто спрашивают");
    expect(head.querySelector(".stitle")?.textContent).toBe("Ответы на популярные вопросы");
    expect(head.querySelector(".stitle em")?.textContent).toBe("популярные вопросы");

    const list = root.querySelector(".faq-list")!;
    expect(shape(list)).toEqual(["details.faq-item", "details.faq-item"]);
    for (const d of Array.from(list.children)) {
      expect(d.hasAttribute("open")).toBe(false);
      expect(shape(d)).toEqual(["summary.", "div.answer"]);
    }
  });

  it("puts the question and the plus sign in the summary", () => {
    const { container } = render(<Faq items={items} />);
    const summaries = Array.from(container.querySelectorAll("summary"));
    expect(summaries.map((s) => s.textContent)).toEqual(["Можно ли с собакой?+", "Есть ли туалет?+"]);
    const first = summaries[0];
    expect(first.childNodes).toHaveLength(2);
    expect(first.firstChild?.nodeType).toBe(Node.TEXT_NODE);
    expect(shape(first)).toEqual(["span.plus"]);
    expect(first.querySelector(".plus")?.textContent).toBe("+");
  });

  it("renders each answer as Markdown directly inside div.answer", () => {
    const { container } = render(<Faq items={items} />);
    const [first, second] = Array.from(container.querySelectorAll(".faq-item > .answer"));
    expect(first.innerHTML).toBe("<p>Да, <strong>на поводке</strong>.</p>");
    expect(shape(second)).toEqual(["p.", "p.", "ul."]);
    expect(second.querySelectorAll("li")).toHaveLength(2);
  });

  it("renders nothing when there are no questions", () => {
    const { container } = render(<Faq items={[]} />);
    expect(container.innerHTML).toBe("");
  });
});
