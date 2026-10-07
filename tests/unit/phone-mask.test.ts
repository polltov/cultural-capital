import { describe, it, expect } from "vitest";
import { normalizePhone } from "@/lib/domain/phone";
import { maskPhone } from "@/lib/domain/phone-mask";

const typed = (str: string) => {
  let v = "";
  for (const c of str) v = maskPhone(v + c);
  return v;
};

describe("maskPhone", () => {
  it("formats progressively without trailing separators", () => {
    expect(maskPhone("")).toBe("");
    expect(maskPhone("9")).toBe("+7 (9");
    expect(maskPhone("+7 (9")).toBe("+7 (9");
    expect(maskPhone("+7 (921")).toBe("+7 (921");
    expect(maskPhone("+7 (9211")).toBe("+7 (921) 1");
    expect(maskPhone("92112345678999")).toBe("+7 (921) 123-45-67");
  });
  it("backspace always makes progress", () => {
    expect(maskPhone("+7 (921) ")).toBe("+7 (921");
    expect(maskPhone("+7 (921) 123-")).toBe("+7 (921) 123");
    expect(maskPhone("+7 (921) 123-45-")).toBe("+7 (921) 123-45");
    expect(maskPhone("+7 (9")).toBe("+7 (9");
    expect(maskPhone("+7 (")).toBe("+7 (");
    expect(maskPhone("+7 ")).toBe(""); // Backspace over "("
    expect(maskPhone("+")).toBe("");
  });
  it("treats first typed 7/8/+ as the prefix", () => {
    expect(typed("+74951234567")).toBe("+7 (495) 123-45-67");
    expect(typed("74951234567")).toBe("+7 (495) 123-45-67");
    expect(typed("84951234567")).toBe("+7 (495) 123-45-67");
    expect(typed("88121234567")).toBe("+7 (812) 123-45-67");
    expect(typed("9111234567")).toBe("+7 (911) 123-45-67");
    expect(typed("7")).toBe("+7 (");
  });
  it("handles pasted numbers", () => {
    expect(maskPhone("8121234567")).toBe("+7 (812) 123-45-67");
    expect(maskPhone("8 911 123-45-67")).toBe("+7 (911) 123-45-67");
    expect(maskPhone("+7 812 1234567")).toBe("+7 (812) 123-45-67");
    expect(maskPhone("89111234567")).toBe("+7 (911) 123-45-67");
  });
  it("complete results are accepted by normalizePhone", () => {
    for (const v of [typed("+74951234567"), typed("88121234567"), typed("9111234567"), maskPhone("8121234567"), maskPhone("8 911 123-45-67"), maskPhone("+7 812 1234567")]) {
      expect(normalizePhone(v)).toMatch(/^\+7\d{10}$/);
    }
  });
});
