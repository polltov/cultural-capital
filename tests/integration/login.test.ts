import { describe, it, expect, beforeAll } from "vitest";
import bcrypt from "bcryptjs";
import { db } from "@/db/client";
import { orders, tours, tourSessions } from "@/db/schema";
import { attemptLogin, LOGIN_ERROR, LOGIN_BLOCKED } from "@/server/admin-auth";
import { getDashboard } from "@/server/admin-orders";
import { hitRateLimit } from "@/server/rate-limit";

beforeAll(() => {
  process.env.SESSION_SECRET = "int-test-secret-0123456789abcdef0123456789abcdef";
  process.env.ADMIN_LOGIN = "admin";
  process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync("right-pass", 4);
});

describe("attemptLogin", () => {
  it("succeeds with right credentials and returns a token", async () => {
    const r = await attemptLogin("admin", "right-pass", "1.1.1.1", db);
    expect(r.ok).toBe(true);
    expect(r.ok && r.token).toBeTruthy();
  });

  it("same generic error for wrong login and wrong password", async () => {
    expect(await attemptLogin("admin", "nope", "1.1.1.1", db)).toEqual({ ok: false, error: LOGIN_ERROR });
    expect(await attemptLogin("nobody", "right-pass", "1.1.1.1", db)).toEqual({ ok: false, error: LOGIN_ERROR });
    expect(LOGIN_ERROR).toBe("Неверный логин или пароль");
  });

  it("blocks the 6th attempt after 5 failures even with the right password", async () => {
    for (let i = 0; i < 5; i++) {
      expect(await attemptLogin("admin", `bad${i}`, "2.2.2.2", db)).toEqual({ ok: false, error: LOGIN_ERROR });
    }
    expect(await attemptLogin("admin", "right-pass", "2.2.2.2", db)).toEqual({ ok: false, error: LOGIN_BLOCKED });
    expect(LOGIN_BLOCKED).toBe("Слишком много попыток. Подождите 15 минут.");
    // другой IP не затронут
    expect((await attemptLogin("admin", "right-pass", "3.3.3.3", db)).ok).toBe(true);
  });

  it("successful logins do not count; success clears earlier failures", async () => {
    for (let i = 0; i < 4; i++) await attemptLogin("admin", "bad", "4.4.4.4", db);
    expect((await attemptLogin("admin", "right-pass", "4.4.4.4", db)).ok).toBe(true);
    for (let i = 0; i < 4; i++) await attemptLogin("admin", "bad", "4.4.4.4", db);
    expect((await attemptLogin("admin", "right-pass", "4.4.4.4", db)).ok).toBe(true);
  });

  it("order rate limit semantics unchanged", async () => {
    for (let i = 0; i < 2; i++) expect(await hitRateLimit("order:x", 2, 60, db)).toBe(true);
    expect(await hitRateLimit("order:x", 2, 60, db)).toBe(false);
  });
});

const DAY = 24 * 3600_000;

describe("getDashboard", () => {
  it("counts only new orders and lists sessions in the next 14 days", async () => {
    const [t] = await db.insert(tours).values({ slug: "a", title: "Эрмитаж", durationLabel: "2 часа", ageLabel: "6+", priceChild: 1, priceAdult: 1 }).returning();
    const mk = (offsetDays: number, extra: { hidden?: boolean; capacity?: number } = {}) =>
      db.insert(tourSessions).values({ tourId: t.id, startsAt: new Date(Date.now() + offsetDays * DAY), ...extra }).returning().then((r) => r[0]);
    const past = await mk(-1);
    const later = await mk(5, { capacity: 10 });
    const soon = await mk(1);
    await mk(3, { hidden: true });
    await mk(15);

    const order = (sessionId: number, status: "new" | "confirmed" | "done" | "cancelled", children: number, adults: number) =>
      ({ sessionId, status, children, adults, customerName: "X", phone: "+7", priceChildSnapshot: 1, priceAdultSnapshot: 1, total: 1, consentAt: new Date() });
    await db.insert(orders).values([
      order(soon.id, "new", 1, 1),
      order(soon.id, "confirmed", 2, 1),
      order(soon.id, "done", 0, 2),
      order(soon.id, "cancelled", 3, 0),
      order(past.id, "new", 1, 0),
      order(later.id, "new", 0, 1),
    ]);

    const d = await getDashboard(db);
    expect(d.newOrders).toBe(3);
    expect(d.upcoming).toEqual([
      { sessionId: soon.id, tourTitle: "Эрмитаж", startsAt: soon.startsAt, capacity: 8, taken: 5 },
      { sessionId: later.id, tourTitle: "Эрмитаж", startsAt: later.startsAt, capacity: 10, taken: 0 },
    ]);
  });
});
