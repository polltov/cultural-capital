// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/app/admin/(panel)/tours/actions", () => ({
  saveTourAction: vi.fn(), saveSessionAction: vi.fn(), deleteSessionAction: vi.fn(),
}));
vi.mock("@/components/admin/ImageDrop", () => ({ ImageDrop: () => null }));
vi.mock("@/components/admin/MarkdownEditor", () => ({ MarkdownEditor: () => null }));

import { TourForm, EMPTY_TOUR } from "@/components/admin/TourForm";

afterEach(cleanup);

const saved = { key: "s-1", id: 1, startsAt: "2030-01-01T11:00", capacity: "8", hidden: false, taken: 0, orders: 0 };

describe("TourForm sessions after tour save", () => {
  it("keeps an unsaved session row when the server sends fresh initial data", () => {
    const props = { id: 5, number: 1, initial: EMPTY_TOUR };
    const { rerender } = render(<TourForm {...props} initialSessions={[saved]} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Добавить сеанс" }));
    expect(screen.getAllByLabelText("Дата и время (МСК)")).toHaveLength(2);

    // tour saved -> router.refresh() -> new server data (taken changed)
    rerender(<TourForm {...props} initial={{ ...EMPTY_TOUR, title: "x" }} initialSessions={[{ ...saved, taken: 3 }]} />);
    expect(screen.getAllByLabelText("Дата и время (МСК)")).toHaveLength(2);
    expect(screen.getByText("занято 3")).toBeTruthy();
  });
});

describe("TourForm meeting point and what to bring", () => {
  it("shows both fields after the note, filled from initial values", () => {
    const initial = { ...EMPTY_TOUR, meetingPoint: "У колонны", whatToBring: "Удобная обувь" };
    render(<TourForm id={5} number={1} initial={initial} initialSessions={[]} />);
    const meeting = screen.getByLabelText("Место встречи") as HTMLTextAreaElement;
    const bring = screen.getByLabelText("Что взять с собой") as HTMLTextAreaElement;
    expect(meeting.value).toBe("У колонны");
    expect(bring.value).toBe("Удобная обувь");
    expect(meeting.rows).toBe(2);
    expect(bring.rows).toBe(3);
    const note = screen.getByLabelText("Примечание");
    expect(note.compareDocumentPosition(meeting) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(meeting.compareDocumentPosition(bring) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("sends both fields to saveTourAction and shows their errors", async () => {
    const { saveTourAction } = await import("@/app/admin/(panel)/tours/actions");
    const save = vi.mocked(saveTourAction);
    save.mockResolvedValue({ ok: false, fieldErrors: { meetingPoint: "Не длиннее 300 символов" } });
    render(<TourForm id={5} number={1} initial={EMPTY_TOUR} initialSessions={[]} />);
    fireEvent.change(screen.getByLabelText("Место встречи"), { target: { value: "Площадь" } });
    fireEvent.change(screen.getByLabelText("Что взять с собой"), { target: { value: "Зонт" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(await screen.findByText("Не длиннее 300 символов")).toBeTruthy();
    expect(save).toHaveBeenCalledWith(5, expect.objectContaining({ meetingPoint: "Площадь", whatToBring: "Зонт" }));
  });
});
