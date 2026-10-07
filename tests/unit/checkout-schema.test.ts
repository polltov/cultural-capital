import { describe, expect, it } from "vitest";
import { z } from "zod";
import { checkoutSchema } from "@/lib/validation/checkout";

const valid = { sessionId: 1, children: 1, adults: 1, name: "Анна", phone: "+7 999 123-45-67", email: "anna@example.com", consent: true };

/** Адрес нужной длины, который сам по себе проходит проверку формата z.email(): метки домена — не длиннее 63 символов. */
function emailOfLength(n: number): string {
  const domain = `${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(63)}.ru`;
  return `${"a".repeat(n - domain.length - 1)}@${domain}`;
}

describe("checkoutSchema: email", () => {
  it("254 символа — ещё можно", () => {
    const email = emailOfLength(254);
    expect(email).toHaveLength(254);
    expect(checkoutSchema.safeParse({ ...valid, email }).success).toBe(true);
  });

  it("длиннее 254 символов — «Проверьте email», хотя формат сам по себе верный", () => {
    const email = emailOfLength(255);
    expect(z.email().safeParse(email).success).toBe(true);
    const r = checkoutSchema.safeParse({ ...valid, email });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => [i.path[0], i.message])).toEqual([["email", "Проверьте email"]]);
  });
});
