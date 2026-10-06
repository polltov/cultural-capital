// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ saveFaqAction: vi.fn(), replace: vi.fn() }));

vi.mock("@/app/admin/(panel)/faq/actions", () => ({ saveFaqAction: mocks.saveFaqAction }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace, refresh: vi.fn() }) }));

import { EMPTY_FAQ, FaqForm } from "@/components/admin/FaqForm";

beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

const question = () => screen.getAllByRole("textbox")[0] as HTMLInputElement;
const answer = () => screen.getAllByRole("textbox")[1] as HTMLTextAreaElement;
const type = (q: string, a: string) => {
  fireEvent.change(question(), { target: { value: q } });
  fireEvent.change(answer(), { target: { value: a } });
};
const save = () => fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

describe("FaqForm", () => {
  it("creates: sends the typed values with no id, then goes to the list with the saved flag", async () => {
    mocks.saveFaqAction.mockResolvedValue({ ok: true, id: 5 });
    render(<FaqForm id={null} initial={EMPTY_FAQ} />);
    type("Можно ли с коляской?", "Да, **можно**.");
    save();
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("/admin/faq?saved=1"));
    expect(mocks.saveFaqAction).toHaveBeenCalledExactlyOnceWith(null, { question: "Можно ли с коляской?", answer: "Да, **можно**." });
  });

  it("edits: starts from the saved text and sends the item id", async () => {
    mocks.saveFaqAction.mockResolvedValue({ ok: true, id: 7 });
    render(<FaqForm id={7} initial={{ question: "Старый вопрос?", answer: "Старый ответ" }} />);
    expect(question().value).toBe("Старый вопрос?");
    expect(answer().value).toBe("Старый ответ");
    fireEvent.change(question(), { target: { value: "Новый вопрос?" } });
    save();
    await waitFor(() => expect(mocks.saveFaqAction).toHaveBeenCalledExactlyOnceWith(7, { question: "Новый вопрос?", answer: "Старый ответ" }));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/admin/faq?saved=1"));
  });

  it("shows each error under its field, keeps what was typed and stays on the page", async () => {
    mocks.saveFaqAction.mockResolvedValue({
      ok: false,
      fieldErrors: { question: "Вопрос: от 3 до 300 символов", answer: "Ответ: от 1 до 5000 символов" },
    });
    render(<FaqForm id={null} initial={EMPTY_FAQ} />);
    type("ab", "   ");
    save();
    await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(2));
    expect(screen.getByText("Вопрос: от 3 до 300 символов").closest("label")).toBe(question().closest("label"));
    expect(screen.getByText("Ответ: от 1 до 5000 символов")).toBeTruthy();
    expect(question().value).toBe("ab");
    expect(answer().value).toBe("   ");
    expect(question().getAttribute("aria-invalid")).toBe("true");
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("shows a server error that belongs to the whole form", async () => {
    mocks.saveFaqAction.mockResolvedValue({ ok: false, fieldErrors: {}, error: "Вопрос не найден" });
    render(<FaqForm id={9} initial={{ question: "Вопрос?", answer: "Ответ" }} />);
    save();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Вопрос не найден"));
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("previews the answer as Markdown on the second tab", () => {
    render(<FaqForm id={null} initial={EMPTY_FAQ} />);
    fireEvent.change(answer(), { target: { value: "Это **важно**" } });
    fireEvent.click(screen.getByRole("tab", { name: "Предпросмотр" }));
    expect(document.querySelector(".editor-preview strong")?.textContent).toBe("важно");
    fireEvent.click(screen.getByRole("tab", { name: "Текст" }));
    expect(answer().value).toBe("Это **важно**");
  });
});
