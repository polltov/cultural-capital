import { describe, it, expect } from "vitest";
import { normalizePhone } from "@/lib/domain/phone";

describe("normalizePhone", () => {
  it.each(["8 (911) 123-45-67", "+7 911 123 45 67", "9111234567", "7-911-123-45-67"])("%s", (s) =>
    expect(normalizePhone(s)).toBe("+79111234567"));
  it.each(["12345", "+1 555 123 4567", ""])("invalid %j", (s) => expect(normalizePhone(s)).toBeNull());
});
