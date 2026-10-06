// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within, act } from "@testing-library/react";
import type { DragEndEvent } from "@dnd-kit/core";

const mocks = vi.hoisted(() => ({
  deleteFaqAction: vi.fn(),
  reorderFaqAction: vi.fn(),
  setFaqPublishedAction: vi.fn(),
  onDragEnd: undefined as ((e: DragEndEvent) => void) | undefined,
}));

vi.mock("@/app/admin/(panel)/faq/actions", () => ({
  deleteFaqAction: mocks.deleteFaqAction,
  reorderFaqAction: mocks.reorderFaqAction,
  setFaqPublishedAction: mocks.setFaqPublishedAction,
}));
// Без раскладки (jsdom) dnd-kit ничего не перетащит: оборачиваем настоящий DndContext и берём его onDragEnd.
vi.mock("@dnd-kit/core", async (importOriginal) => {
  const real = await importOriginal<typeof import("@dnd-kit/core")>();
  return {
    ...real,
    DndContext: (props: React.ComponentProps<typeof real.DndContext>) => {
      mocks.onDragEnd = props.onDragEnd;
      return <real.DndContext {...props} />;
    },
  };
});

import { FaqList } from "@/components/admin/FaqList";

beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

const items = [
  { id: 1, question: "Первый вопрос?", published: true },
  { id: 2, question: "Второй вопрос?", published: false },
  { id: 3, question: "Третий вопрос?", published: true },
];
const CONFIRM = "Удалить вопрос? Это нельзя отменить.";
const ERR_STALE = "Список вопросов изменился — обновите страницу";

const order = () => screen.getAllByRole("button", { name: /^Перетащить: / }).map((b) => b.getAttribute("aria-label")!.replace("Перетащить: ", ""));
const rowOf = (question: string) => screen.getByText(question).closest("li") as HTMLElement;
const drag = (from: number, to: number) =>
  act(async () => {
    mocks.onDragEnd!({ active: { id: from }, over: { id: to } } as unknown as DragEndEvent);
  });

describe("FaqList", () => {
  it("lists questions in order with a hidden badge, a switch and an edit link", () => {
    render(<FaqList initial={items} />);
    expect(order()).toEqual(["Первый вопрос?", "Второй вопрос?", "Третий вопрос?"]);
    expect(screen.getAllByText("скрыт")).toHaveLength(1);
    expect(within(rowOf("Второй вопрос?")).getByText("скрыт")).toBeTruthy();
    expect(screen.getAllByRole("switch", { name: "На сайте" }).map((s) => s.getAttribute("aria-checked"))).toEqual(["true", "false", "true"]);
    expect(screen.getAllByRole("link", { name: "Изменить" }).map((a) => a.getAttribute("href"))).toEqual(["/admin/faq/1", "/admin/faq/2", "/admin/faq/3"]);
  });

  it("shows an empty state with a way to add the first question", () => {
    render(<FaqList initial={[]} />);
    expect(screen.getByText("Вопросов пока нет")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Добавить вопрос" }).getAttribute("href")).toBe("/admin/faq/new");
  });

  it("asks for explicit confirmation before deleting, and cancel changes nothing", () => {
    render(<FaqList initial={items} />);
    fireEvent.click(within(rowOf("Первый вопрос?")).getByRole("button", { name: "Удалить" }));
    expect(screen.getByText(CONFIRM)).toBeTruthy();
    expect(mocks.deleteFaqAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
    expect(screen.queryByText(CONFIRM)).toBeNull();
    expect(order()).toHaveLength(3);
    expect(mocks.deleteFaqAction).not.toHaveBeenCalled();
  });

  it("deletes after confirmation and removes only that row", async () => {
    mocks.deleteFaqAction.mockResolvedValue({ ok: true });
    render(<FaqList initial={items} />);
    fireEvent.click(within(rowOf("Второй вопрос?")).getByRole("button", { name: "Удалить" }));
    fireEvent.click(screen.getByRole("button", { name: "Да, удалить" }));
    await waitFor(() => expect(order()).toEqual(["Первый вопрос?", "Третий вопрос?"]));
    expect(mocks.deleteFaqAction).toHaveBeenCalledExactlyOnceWith(2);
  });

  it("keeps the row and shows the error when the server refuses to delete", async () => {
    mocks.deleteFaqAction.mockResolvedValue({ ok: false, error: "Вопрос не найден" });
    render(<FaqList initial={items} />);
    fireEvent.click(within(rowOf("Первый вопрос?")).getByRole("button", { name: "Удалить" }));
    fireEvent.click(screen.getByRole("button", { name: "Да, удалить" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Вопрос не найден"));
    expect(order()).toHaveLength(3);
    expect(screen.queryByText(CONFIRM)).toBeNull();
  });

  it("flips the switch at once and keeps it when the server agrees", async () => {
    mocks.setFaqPublishedAction.mockResolvedValue({ ok: true });
    render(<FaqList initial={items} />);
    const row = rowOf("Первый вопрос?");
    const sw = within(row).getByRole("switch");
    fireEvent.click(sw);
    expect(sw.getAttribute("aria-checked")).toBe("false");
    expect(within(row).getByText("скрыт")).toBeTruthy();
    await waitFor(() => expect(mocks.setFaqPublishedAction).toHaveBeenCalledExactlyOnceWith(1, false));
    expect(sw.getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("puts the switch back and shows the error when the server refuses", async () => {
    mocks.setFaqPublishedAction.mockResolvedValue({ ok: false, error: "Вопрос не найден" });
    render(<FaqList initial={items} />);
    const row = rowOf("Первый вопрос?");
    const sw = within(row).getByRole("switch");
    fireEvent.click(sw);
    await waitFor(() => expect(sw.getAttribute("aria-checked")).toBe("true"));
    expect(screen.getByRole("alert").textContent).toBe("Вопрос не найден");
    expect(within(row).queryByText("скрыт")).toBeNull();
  });

  it("moves a dragged question at once and sends the whole new order", async () => {
    mocks.reorderFaqAction.mockResolvedValue({ ok: true });
    render(<FaqList initial={items} />);
    await drag(1, 3);
    expect(order()).toEqual(["Второй вопрос?", "Третий вопрос?", "Первый вопрос?"]);
    expect(mocks.reorderFaqAction).toHaveBeenCalledExactlyOnceWith([2, 3, 1]);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("restores the previous order and shows the error when the server refuses", async () => {
    mocks.reorderFaqAction.mockResolvedValue({ ok: false, error: ERR_STALE });
    render(<FaqList initial={items} />);
    await drag(1, 3);
    await waitFor(() => expect(order()).toEqual(["Первый вопрос?", "Второй вопрос?", "Третий вопрос?"]));
    expect(screen.getByRole("alert").textContent).toBe(ERR_STALE);
  });
});
