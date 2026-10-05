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
