import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, tours, tourSessions } from "@/db/schema";
import { startOfMoscowDay } from "@/lib/domain/moscow-time";
import { runDaily } from "@/server/daily";
import { sendMail } from "@/server/mail/send";
import { moveOrder } from "@/server/refunds";

vi.mock("@/server/mail/send", () => ({ sendMail: vi.fn() }));

const H = 3600_000;
const DAY = 24 * H;
let seq = 0;
let log: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  seq = 0;
  vi.mocked(sendMail).mockReset();
  vi.mocked(sendMail).mockResolvedValue(true);
  log = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => log.mockRestore());

const now = () => new Date();
/** Завтра в 11:00 по Москве. */
const tomorrow11 = () => new Date(startOfMoscowDay(new Date()).getTime() + DAY + 11 * H);
const orderOf = async (id: number) => (await db.select().from(orders).where(eq(orders.id, id)))[0];
const sentTo = () => vi.mocked(sendMail).mock.calls.map(([m]) => m.to);
const subjects = () => vi.mocked(sendMail).mock.calls.map(([m]) => m.subject);

async function tour(over: Partial<typeof tours.$inferInsert> = {}) {
  const [t] = await db
    .insert(tours)
    .values({ slug: `t${++seq}`, title: "Эрмитаж", durationLabel: "2 часа", ageLabel: "6+", priceChild: 1000, priceAdult: 1270, published: true, meetingPoint: "У кассы", ...over })
    .returning();
  return t;
}
async function session(tourId: number, startsAt: Date, over: Partial<typeof tourSessions.$inferInsert> = {}) {
  const [s] = await db.insert(tourSessions).values({ tourId, startsAt, capacity: 8, ...over }).returning();
  return s;
}
async function order(sessionId: number, over: Partial<typeof orders.$inferInsert> = {}) {
  const [o] = await db
    .insert(orders)
    .values({
      sessionId, customerName: "Анна", phone: "+79991234567", email: "anna@example.com", children: 2, adults: 1,
      priceChildSnapshot: 1000, priceAdultSnapshot: 1270, total: 3270, status: "paid", paymentId: `pay-${++seq}`,
      paymentStatus: "succeeded", paidAt: new Date(Date.now() - 2 * DAY), consentAt: new Date(), accessToken: `tok-${seq}`, ...over,
    })
    .returning();
  return o;
}

describe("runDaily: напоминания", () => {
  it("оплаченный заказ на завтра → письмо-напоминание, отметка; повторный запуск письма не шлёт", async () => {
    const t = await tour();
    const s = await session(t.id, tomorrow11());
    const o = await order(s.id);

    expect(await runDaily({ db, now: now() })).toEqual({ reminders: 1, abandoned: 0, failed: 0 });
    expect(sentTo()).toEqual(["anna@example.com"]);
    expect(subjects()[0]).toMatch(/^Напоминание: «Эрмитаж»/);
    expect((await orderOf(o.id)).reminderSentAt).not.toBeNull();

    expect(await runDaily({ db, now: now() })).toEqual({ reminders: 0, abandoned: 0, failed: 0 });
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it("сегодняшний вечерний сеанс тоже получает напоминание", async () => {
    const t = await tour();
    const s = await session(t.id, new Date(Date.now() + 2 * H));
    await order(s.id);
    expect((await runDaily({ db, now: now() })).reminders).toBe(1);
  });

  it("не шлёт: послезавтра и позже, прошедший сеанс, не оплаченный/отменённый/проведённый, без email, купили только что", async () => {
    const t = await tour();
    const later = await session(t.id, new Date(tomorrow11().getTime() + DAY));
    const past = await session(t.id, new Date(Date.now() - H));
    const soon = await session(t.id, tomorrow11());
    await order(later.id);
    await order(past.id);
    await order(soon.id, { status: "cancelled" });
    await order(soon.id, { status: "expired", paymentStatus: "canceled" });
    await order(soon.id, { status: "done" });
    await order(soon.id, { email: null });
    await order(soon.id, { paidAt: new Date(Date.now() - H) });

    expect(await runDaily({ db, now: now() })).toEqual({ reminders: 0, abandoned: 0, failed: 0 });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("письмо не ушло → отметка снята, сбой посчитан; следующий запуск повторяет", async () => {
    const t = await tour();
    const s = await session(t.id, tomorrow11());
    const o = await order(s.id);
    vi.mocked(sendMail).mockResolvedValueOnce(false);

    expect(await runDaily({ db, now: now() })).toEqual({ reminders: 0, abandoned: 0, failed: 1 });
    expect((await orderOf(o.id)).reminderSentAt).toBeNull();

    expect(await runDaily({ db, now: now() })).toEqual({ reminders: 1, abandoned: 0, failed: 0 });
  });

  it("перенос на другой сеанс сбрасывает отметку напоминания", async () => {
    const t = await tour();
    const a = await session(t.id, tomorrow11());
    const b = await session(t.id, new Date(tomorrow11().getTime() + 7 * DAY));
    const o = await order(a.id, { reminderSentAt: new Date() });

    expect(await moveOrder(o.id, b.id, db)).toEqual({ ok: true });
    expect((await orderOf(o.id)).reminderSentAt).toBeNull();
  });
});

describe("runDaily: «вы не завершили оплату»", () => {
  /** Неоплаченный заказ, созданный `agoH` часов назад. */
  const abandoned = (sessionId: number, agoH = 2, over: Partial<typeof orders.$inferInsert> = {}) =>
    order(sessionId, { status: "expired", paymentStatus: "canceled", paidAt: null, createdAt: new Date(Date.now() - agoH * H), ...over });
  const run = () => runDaily({ db, now: now(), abandoned: true });

  it("выключено (по умолчанию) — не шлёт", async () => {
    const t = await tour();
    const s = await session(t.id, new Date(Date.now() + 2 * DAY));
    await abandoned(s.id);
    expect(await runDaily({ db, now: now(), abandoned: false })).toEqual({ reminders: 0, abandoned: 0, failed: 0 });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("включено: письмо со ссылкой на страницу экскурсии; отметка; повторно не шлёт", async () => {
    const t = await tour({ slug: "ermitazh" });
    const s = await session(t.id, new Date(Date.now() + 2 * DAY));
    const o = await abandoned(s.id);

    expect(await run()).toEqual({ reminders: 0, abandoned: 1, failed: 0 });
    const [m] = vi.mocked(sendMail).mock.calls[0];
    expect(m.subject).toBe("Вы не завершили покупку — «Эрмитаж»");
    expect(m.text).toContain("/tours/ermitazh#booking");
    expect((await orderOf(o.id)).abandonedMailSentAt).not.toBeNull();

    expect((await run()).abandoned).toBe(0);
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it("покупатель потом оформил другой заказ (адрес в другом регистре) — не шлёт", async () => {
    const t = await tour();
    const s = await session(t.id, new Date(Date.now() + 2 * DAY));
    await abandoned(s.id, 3);
    await order(s.id, { email: "Anna@Example.com", createdAt: new Date(Date.now() - 2 * H) });
    expect((await run()).abandoned).toBe(0);
  });

  it("мест на ту дату уже не хватает — не шлёт", async () => {
    const t = await tour();
    const s = await session(t.id, new Date(Date.now() + 2 * DAY), { capacity: 8 });
    await order(s.id, { email: "other@example.com", children: 3, adults: 3 }); // занято 6 из 8
    await abandoned(s.id); // нужно 3
    expect((await run()).abandoned).toBe(0);
  });

  it("не шлёт: экскурсия скоро (меньше 3 ч), сеанс скрыт, экскурсия снята, заказ свежий или старый, платёж прошёл поздно", async () => {
    const t = await tour();
    const hiddenTour = await tour({ published: false });
    const soon = await session(t.id, new Date(Date.now() + 2 * H));
    const hidden = await session(t.id, new Date(Date.now() + 2 * DAY), { hidden: true });
    const unpublished = await session(hiddenTour.id, new Date(Date.now() + 2 * DAY));
    const ok = await session(t.id, new Date(Date.now() + 2 * DAY), { capacity: 50 });
    await abandoned(soon.id, 2, { email: "a@x.test" });
    await abandoned(hidden.id, 2, { email: "b@x.test" });
    await abandoned(unpublished.id, 2, { email: "c@x.test" });
    await abandoned(ok.id, 0.5, { email: "d@x.test" });
    await abandoned(ok.id, 80, { email: "e@x.test" });
    await abandoned(ok.id, 2, { email: "f@x.test", paymentStatus: "succeeded" });
    await abandoned(ok.id, 2, { email: null });
    expect((await run()).abandoned).toBe(0);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("два брошенных заказа одного адреса — одно письмо, о самом свежем", async () => {
    const t = await tour();
    const s = await session(t.id, new Date(Date.now() + 2 * DAY), { capacity: 50 });
    const older = await abandoned(s.id, 5);
    const newer = await abandoned(s.id, 2);
    expect((await run()).abandoned).toBe(1);
    expect((await orderOf(newer.id)).abandonedMailSentAt).not.toBeNull();
    expect((await orderOf(older.id)).abandonedMailSentAt).toBeNull();
  });

  it.each([
    [5, 0],
    [20, 1],
  ])("на этот адрес такое письмо уходило %i дн. назад → писем %i (не чаще раза в 14 дней)", async (daysAgo, expected) => {
    const t = await tour();
    const s = await session(t.id, new Date(Date.now() + 2 * DAY), { capacity: 50 });
    await abandoned(s.id, 30 * 24, { abandonedMailSentAt: new Date(Date.now() - daysAgo * DAY) });
    await abandoned(s.id, 2);
    expect((await run()).abandoned).toBe(expected);
  });
});
