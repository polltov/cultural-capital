import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { faqItems } from "@/db/schema";
import {
  deleteFaqItem, getFaqItem, listAllFaq, listPublishedFaq, reorderFaq, saveFaqItem, setFaqPublished,
} from "@/server/faq";

const valid = { question: "Как добраться до места встречи?", answer: "Мы встречаем у **метро**." };
const NOT_FOUND = "Вопрос не найден";
const Q_ERR = "Вопрос: от 3 до 300 символов";
const A_ERR = "Ответ: от 1 до 5000 символов";
const BAD_ORDER = "Некорректный порядок";
const STALE = "Список вопросов изменился — обновите страницу";

async function mk(question: string, over: Partial<typeof faqItems.$inferInsert> = {}) {
  const [row] = await db.insert(faqItems).values({ question, answer: `Ответ: ${question}`, ...over }).returning();
  return row;
}
const rows = () => db.select().from(faqItems).orderBy(faqItems.id);
const order = async () => (await listAllFaq(db)).map((x) => x.id);

describe("saveFaqItem", () => {
  it("appends new questions at the end, visible on the site", async () => {
    const results = [
      await saveFaqItem(valid, undefined, db),
      await saveFaqItem({ ...valid, question: "Второй вопрос?" }, undefined, db),
      await saveFaqItem({ ...valid, question: "Третий вопрос?" }, undefined, db),
    ];
    expect(results.map((r) => r.ok)).toEqual([true, true, true]);
    expect((await listAllFaq(db)).map((x) => [x.question, x.sortOrder, x.published])).toEqual([
      ["Как добраться до места встречи?", 0, true],
      ["Второй вопрос?", 1, true],
      ["Третий вопрос?", 2, true],
    ]);
  });

  it("continues after the highest sortOrder even when there are gaps", async () => {
    await mk("Старый вопрос?", { sortOrder: 7 });
    expect((await saveFaqItem(valid, undefined, db)).ok).toBe(true);
    expect((await listAllFaq(db)).map((x) => x.sortOrder)).toEqual([7, 8]);
  });

  it("stores trimmed text", async () => {
    const r = await saveFaqItem({ question: "  Есть ли скидки?  ", answer: "\n Да. \n" }, undefined, db);
    expect(r.ok).toBe(true);
    const [row] = await rows();
    expect([row.question, row.answer]).toEqual(["Есть ли скидки?", "Да."]);
  });

  it.each([
    ["empty", ""],
    ["too short", "ab"],
    ["blank", "   "],
    ["too long", "x".repeat(301)],
  ])("rejects a question that is %s, with a Russian message, and saves nothing", async (_name, question) => {
    expect(await saveFaqItem({ ...valid, question }, undefined, db)).toEqual({ ok: false, fieldErrors: { question: Q_ERR } });
    expect(await rows()).toHaveLength(0);
  });

  it.each([
    ["empty", ""],
    ["blank", "  \n "],
    ["over 5000 characters", "a".repeat(5001)],
  ])("rejects an answer that is %s, with a Russian message, and saves nothing", async (_name, answer) => {
    expect(await saveFaqItem({ ...valid, answer }, undefined, db)).toEqual({ ok: false, fieldErrors: { answer: A_ERR } });
    expect(await rows()).toHaveLength(0);
  });

  it("reports both fields when the input has the wrong shape", async () => {
    const expected = { ok: false, fieldErrors: { question: Q_ERR, answer: A_ERR } };
    expect(await saveFaqItem({}, undefined, db)).toEqual(expected);
    expect(await saveFaqItem({ question: 123, answer: null }, undefined, db)).toEqual(expected);
  });

  it.each([
    ["3-character question", { question: "abc" }],
    ["300-character question", { question: "q".repeat(300) }],
    ["5000-character answer", { answer: "a".repeat(5000) }],
  ])("accepts a %s", async (_name, over) => {
    expect((await saveFaqItem({ ...valid, ...over }, undefined, db)).ok).toBe(true);
  });

  it("updates the text and updatedAt, leaving order and visibility alone", async () => {
    const item = await mk("Старый вопрос?", { sortOrder: 4, published: false });
    await db.update(faqItems).set({ updatedAt: new Date(0) }).where(eq(faqItems.id, item.id));
    const r = await saveFaqItem({ question: "Новый вопрос?", answer: "Новый ответ" }, item.id, db);
    expect(r).toEqual({ ok: true, id: item.id });
    const [row] = await rows();
    expect([row.question, row.answer, row.sortOrder, row.published]).toEqual(["Новый вопрос?", "Новый ответ", 4, false]);
    expect(row.updatedAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it("reports an unknown id on update and creates nothing", async () => {
    expect(await saveFaqItem(valid, 99999, db)).toEqual({ ok: false, fieldErrors: {}, error: NOT_FOUND });
    expect(await rows()).toHaveLength(0);
  });
});

describe("listPublishedFaq / listAllFaq / getFaqItem", () => {
  it("lists only published questions ordered by sortOrder, then id", async () => {
    const late = await mk("Поздний", { sortOrder: 2 });
    await mk("Скрытый", { sortOrder: 0, published: false });
    const first = await mk("Первый", { sortOrder: 1 });
    const twin = await mk("Близнец", { sortOrder: 1 });
    expect(await listPublishedFaq(db)).toEqual([
      { id: first.id, question: "Первый", answer: "Ответ: Первый" },
      { id: twin.id, question: "Близнец", answer: "Ответ: Близнец" },
      { id: late.id, question: "Поздний", answer: "Ответ: Поздний" },
    ]);
  });

  it("lists nothing when every question is hidden", async () => {
    await mk("Скрытый", { published: false });
    expect(await listPublishedFaq(db)).toEqual([]);
  });

  it("lists hidden questions too for the admin, in the same order, with every field", async () => {
    const hidden = await mk("Скрытый", { sortOrder: 0, published: false });
    const shown = await mk("Видимый", { sortOrder: 1 });
    expect(await listAllFaq(db)).toEqual([
      { id: hidden.id, question: "Скрытый", answer: "Ответ: Скрытый", sortOrder: 0, published: false },
      { id: shown.id, question: "Видимый", answer: "Ответ: Видимый", sortOrder: 1, published: true },
    ]);
  });

  it("returns one question (hidden too) or null", async () => {
    const hidden = await mk("Скрытый", { sortOrder: 3, published: false });
    expect(await getFaqItem(hidden.id, db)).toEqual({ id: hidden.id, question: "Скрытый", answer: "Ответ: Скрытый", sortOrder: 3, published: false });
    expect(await getFaqItem(hidden.id + 1, db)).toBeNull();
  });
});

describe("setFaqPublished", () => {
  it("hides and shows a question and bumps updatedAt", async () => {
    const item = await mk("Вопрос?");
    await db.update(faqItems).set({ updatedAt: new Date(0) }).where(eq(faqItems.id, item.id));
    expect(await setFaqPublished(item.id, false, db)).toEqual({ ok: true });
    expect(await listPublishedFaq(db)).toEqual([]);
    const [hidden] = await rows();
    expect(hidden.published).toBe(false);
    expect(hidden.updatedAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
    expect(await setFaqPublished(item.id, true, db)).toEqual({ ok: true });
    expect(await listPublishedFaq(db)).toHaveLength(1);
  });

  it("reports an unknown id", async () => {
    expect(await setFaqPublished(99999, true, db)).toEqual({ ok: false, error: NOT_FOUND });
  });
});

describe("reorderFaq", () => {
  async function three() {
    const a = await mk("A-вопрос", { sortOrder: 0 });
    const b = await mk("B-вопрос", { sortOrder: 1, published: false });
    const c = await mk("C-вопрос", { sortOrder: 2 });
    return [a.id, b.id, c.id] as const;
  }

  it("rewrites sortOrder to the list index, hidden questions included", async () => {
    const [a, b, c] = await three();
    expect(await reorderFaq([c, a, b], db)).toEqual({ ok: true });
    expect((await listAllFaq(db)).map((x) => [x.id, x.sortOrder, x.published])).toEqual([
      [c, 0, true],
      [a, 1, true],
      [b, 2, false],
    ]);
    expect((await listPublishedFaq(db)).map((x) => x.id)).toEqual([c, a]);
  });

  it("rejects a duplicate id as an invalid order", async () => {
    const [a, b, c] = await three();
    expect(await reorderFaq([a, a, b], db)).toEqual({ ok: false, error: BAD_ORDER });
    expect(await order()).toEqual([a, b, c]);
  });

  it("rejects a list that misses an existing id", async () => {
    const [a, b, c] = await three();
    expect(await reorderFaq([b, a], db)).toEqual({ ok: false, error: STALE });
    expect(await order()).toEqual([a, b, c]);
  });

  it("rejects a list with an id that does not exist", async () => {
    const [a, b, c] = await three();
    expect(await reorderFaq([a, b, 99999], db)).toEqual({ ok: false, error: STALE });
    expect(await reorderFaq([c, b, a, 99999], db)).toEqual({ ok: false, error: STALE });
    expect(await order()).toEqual([a, b, c]);
  });
});

describe("deleteFaqItem", () => {
  it("removes the question and leaves the others", async () => {
    const a = await mk("A-вопрос", { sortOrder: 0 });
    const b = await mk("B-вопрос", { sortOrder: 1 });
    expect(await deleteFaqItem(a.id, db)).toEqual({ ok: true });
    expect(await order()).toEqual([b.id]);
    expect(await deleteFaqItem(a.id, db)).toEqual({ ok: false, error: NOT_FOUND });
  });
});

describe("ids outside 1..2147483647", () => {
  it.each([0, -1, 1.5, Number.NaN, 2_147_483_648, Number.MAX_SAFE_INTEGER, Number.POSITIVE_INFINITY])(
    "%s is rejected without reaching the database",
    async (bad) => {
      expect(await getFaqItem(bad, db)).toBeNull();
      expect(await saveFaqItem(valid, bad, db)).toEqual({ ok: false, fieldErrors: {}, error: NOT_FOUND });
      expect(await setFaqPublished(bad, true, db)).toEqual({ ok: false, error: NOT_FOUND });
      expect(await deleteFaqItem(bad, db)).toEqual({ ok: false, error: NOT_FOUND });
      expect(await reorderFaq([bad], db)).toEqual({ ok: false, error: BAD_ORDER });
    },
  );

  it("the largest valid id is a plain miss, not an error", async () => {
    expect(await getFaqItem(2_147_483_647, db)).toBeNull();
    expect(await deleteFaqItem(2_147_483_647, db)).toEqual({ ok: false, error: NOT_FOUND });
  });
});
