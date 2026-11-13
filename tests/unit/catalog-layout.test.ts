import { describe, it, expect } from "vitest";
import { cellClass, loneCards } from "@/lib/domain/catalog-layout";

const F = { featured: true };
const N = { featured: false };
const two = (items: { featured: boolean }[]) => loneCards(items).map((f) => f.two);
const three = (items: { featured: boolean }[]) => loneCards(items).map((f) => f.three);

describe("loneCards", () => {
  it("marks the last card of a run that would sit alone in its row", () => {
    // крупная + три обычные: на планшете (2 колонки) третья обычная остаётся одна, на компьютере (3) ряд полный
    expect(two([F, N, N, N])).toEqual([false, false, false, true]);
    expect(three([F, N, N, N])).toEqual([false, false, false, false]);
    // крупная + четыре обычные: на компьютере четвёртая остаётся одна
    expect(three([F, N, N, N, N])).toEqual([false, false, false, false, true]);
    expect(two([F, N, N, N, N])).toEqual([false, false, false, false, false]);
  });

  it("treats every run between featured cards separately", () => {
    expect(two([N, F, N, N, N, F, N])).toEqual([true, false, false, false, true, false, true]);
    expect(three([N, N, F, N, N, N, N])).toEqual([false, false, false, false, false, false, true]);
  });

  it("never marks featured cards, full rows or a pair in a three-column row", () => {
    expect(loneCards([F, F])).toEqual([{ two: false, three: false }, { two: false, three: false }]);
    expect(two([N, N])).toEqual([false, false]);
    expect(three([N, N])).toEqual([false, false]);
    expect(loneCards([])).toEqual([]);
  });

  it("a single card is alone in both layouts", () => {
    expect(loneCards([N])).toEqual([{ two: true, three: true }]);
  });
});

describe("cellClass", () => {
  it("combines the cell modifiers", () => {
    expect(cellClass(false, { two: false, three: false })).toBe("catalog-cell");
    expect(cellClass(true, { two: false, three: false })).toBe("catalog-cell is-featured");
    expect(cellClass(false, { two: true, three: true })).toBe("catalog-cell is-lone-2 is-lone-3");
  });
});
