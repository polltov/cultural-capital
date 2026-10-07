import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Миграция 0004 меняет три ответа блока FAQ под онлайн-оплату. Каждый UPDATE срабатывает, только если
// в базе всё ещё лежит исходный ответ из сида 0002: правки владельца в админке не затираются.
// Интеграционный тест не подходит: tests/integration/setup.ts очищает faq_items перед каждым тестом.
const dir = join(__dirname, "../../drizzle");
const seed = readFileSync(join(dir, "0002_faq_seed.sql"), "utf8");
const migration = readFileSync(join(dir, "0004_faq_payment_texts.sql"), "utf8");

const unquote = (s: string) => s.replace(/''/g, "'");
const str = String.raw`'((?:[^']|'')*)'`;

// Вопрос → ответ, как их вставил сид 0002 (дословно).
const seeded = new Map<string, string>(
  Array.from(seed.matchAll(new RegExp(String.raw`\(${str}, ${str}, \d+, (?:true|false)\)`, "g"))).map(
    (m) => [unquote(m[1]), unquote(m[2])] as const,
  ),
);

const updates = Array.from(
  migration.matchAll(
    new RegExp(String.raw`UPDATE "faq_items" SET "answer" = ${str} WHERE "question" = ${str} AND "answer" = ${str};`, "g"),
  ),
).map((m) => ({ answer: unquote(m[1]), question: unquote(m[2]), oldAnswer: unquote(m[3]) }));

const PAYMENT = "Как оплатить и можно ли отменить бронь?";
const DISCOUNT = "Есть ли скидки для больших семей?";
const INDIVIDUAL = "Проводите индивидуальные экскурсии?";

describe("0004_faq_payment_texts", () => {
  it("parses all six seeded questions (guards the parser itself)", () => {
    expect(seeded.size).toBe(6);
  });

  it("has exactly three UPDATE statements, all of them well-formed", () => {
    expect(migration.match(/UPDATE "faq_items"/g)).toHaveLength(3);
    expect(updates.map((u) => u.question).sort()).toEqual([PAYMENT, DISCOUNT, INDIVIDUAL].sort());
  });

  it("guards every UPDATE with the old seeded answer verbatim", () => {
    for (const u of updates) {
      expect(seeded.get(u.question), u.question).toBeDefined();
      expect(u.oldAnswer, u.question).toBe(seeded.get(u.question));
      expect(u.answer, u.question).not.toBe(u.oldAnswer);
    }
  });

  it("writes the new payment, discount and individual-tour answers", () => {
    const answer = (q: string) => updates.find((u) => u.question === q)!.answer;
    expect(answer(PAYMENT)).toBe(
      "Оплата онлайн на сайте — картой, по СБП, SberPay или T-Pay. Билет и кассовый чек приходят на почту. " +
        "Отменить или перенести без потерь можно за 24 часа до начала, позже — возврат 50%. Для отмены напишите или позвоните нам.",
    );
    expect(answer(DISCOUNT)).toBe(
      "Для семей от 4 человек и для двух экскурсий в один визит есть специальные условия — напишите нам, подберём вариант.",
    );
    // Старый ответ, только «по запросу через форму или в личном сообщении» → «по запросу: напишите или позвоните нам».
    expect(answer(INDIVIDUAL)).toBe(
      seeded.get(INDIVIDUAL)!.replace("по запросу через форму или в личном сообщении", "по запросу: напишите или позвоните нам"),
    );
    expect(answer(PAYMENT)).toContain("картой, по СБП, SberPay или T-Pay");
    expect(answer(DISCOUNT)).toContain("напишите нам, подберём вариант");
    expect(answer(INDIVIDUAL)).toContain("по запросу: напишите или позвоните нам");
  });

  it("does not touch the order_status enum (new values are not usable in the same transaction)", () => {
    expect(migration).not.toMatch(/order_status/);
  });
});
