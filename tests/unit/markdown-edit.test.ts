import { describe, it, expect } from "vitest";
import { applyBold, applyItalic, applyList, applyLink } from "@/lib/markdown-edit";

describe("markdown-edit", () => {
  it("wraps selection in bold", () => {
    expect(applyBold("hello world", 6, 11)).toEqual({ text: "hello **world**", start: 8, end: 13 });
  });
  it("inserts a placeholder for empty selection", () => {
    const r = applyItalic("ab", 1, 1);
    expect(r.text).toBe("a*текст*b");
    expect(r.text.slice(r.start, r.end)).toBe("текст");
  });
  it("prefixes each selected line with '- ' and expands to full lines", () => {
    const r = applyList("one\ntwo\nthree", 2, 6);
    expect(r.text).toBe("- one\n- two\nthree");
  });
  it("does not double-prefix lines that already are list items", () => {
    expect(applyList("- one\ntwo", 0, 9).text).toBe("- one\n- two");
  });
  it("makes a link around selection and selects the url", () => {
    const r = applyLink("see docs", 4, 8);
    expect(r.text).toBe("see [docs](https://)");
    expect(r.text.slice(r.start, r.end)).toBe("https://");
  });
  it("link with empty selection uses placeholder text", () => {
    expect(applyLink("", 0, 0).text).toBe("[текст](https://)");
  });
});
