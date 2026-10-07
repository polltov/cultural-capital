// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { AwaitPayment } from "@/components/site/AwaitPayment";

const refresh = vi.fn();
// Как в Next: `useRouter()` отдаёт один и тот же объект между рендерами.
const router = { refresh };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const GIVE_UP = "Оплата ещё обрабатывается — билет придёт на почту, как только банк подтвердит платёж";
const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

beforeEach(() => {
  refresh.mockReset();
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("AwaitPayment", () => {
  it("обновляет страницу каждые 3 с и пишет «Проверяем оплату…»", () => {
    render(<AwaitPayment />);
    expect(screen.getByRole("heading", { name: "Проверяем оплату…" })).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();

    tick(2_999);
    expect(refresh).not.toHaveBeenCalled();
    tick(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    tick(6_000);
    expect(refresh).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole("heading", { name: GIVE_UP })).toBeNull();
  });

  it("после 20 обновлений (60 с) перестаёт опрашивать и пишет, что оплата ещё обрабатывается", () => {
    render(<AwaitPayment />);

    tick(60_000);
    expect(refresh).toHaveBeenCalledTimes(20);
    // Последнее обновление ещё может принести билет: сообщение не показываем, пока оно не отработало.
    expect(screen.queryByRole("heading", { name: GIVE_UP })).toBeNull();

    tick(3_000);
    expect(screen.getByRole("heading", { name: GIVE_UP })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Проверяем оплату…" })).toBeNull();

    tick(120_000);
    expect(refresh).toHaveBeenCalledTimes(20);
  });

  it("при размонтировании таймер снимается", () => {
    const { unmount } = render(<AwaitPayment />);
    tick(3_000);
    expect(refresh).toHaveBeenCalledTimes(1);

    unmount();
    tick(60_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
