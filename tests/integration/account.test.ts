import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { customerLoginTokens, orders, tours, tourSessions } from "@/db/schema";
import { consumeLoginToken, listCustomerOrders, requestLoginLink } from "@/server/account";
import { sendMail } from "@/server/mail/send";

vi.mock("@/server/mail/send", () => ({ sendMail: vi.fn() }));

const H = 3600_000;
let ip = 0;
const nextIp = () => `7.7.7.${++ip}`;

beforeEach(() => {
  vi.stubEnv("SITE_URL", "https://x.test");
  vi.mocked(sendMail).mockReset();
  vi.mocked(sendMail).mockResolvedValue(true);
});

let seq = 0;
async function order(over: Partial<typeof orders.$inferInsert> & { startsAt?: Date } = {}) {
  const { startsAt, ...rest } = over;
  const [t] = await db.insert(tours).values({ slug: `t${++seq}`, title: `Экскурсия ${seq}`, durationLabel: "2 часа", ageLabel: "6+", priceChild: 1000, priceAdult: 1270, published: true }).returning();
  const [s] = await db.insert(tourSessions).values({ tourId: t.id, startsAt: startsAt ?? new Date(Date.now() + 48 * H), capacity: 8 }).returning();
  const [o] = await db
    .insert(orders)
    .values({
      sessionId: s.id, customerName: "Анна", phone: "+79991234567", email: "Anna@Example.com", children: 1, adults: 1,
      priceChildSnapshot: 1000, priceAdultSnapshot: 1270, total: 2270, status: "paid", consentAt: new Date(),
      accessToken: `${"a".repeat(40)}${String(seq).padStart(3, "0")}`, ...rest,
    })
    .returning();
  return o;
}
const linkFromMail = () => {
  const m = vi.mocked(sendMail).mock.calls[0][0];
  return /https:\/\/x\.test\/account\/login\/([A-Za-z0-9_-]{43})/.exec(m.text)![1];
};

describe("requestLoginLink", () => {
  it("есть заказы на адрес (регистр не важен) — письмо со ссылкой; в БД только хеш", async () => {
    await order();
    expect(await requestLoginLink("  anna@EXAMPLE.com ", nextIp(), db)).toBe("sent");
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendMail).mock.calls[0][0].to).toBe("anna@example.com");
    const token = linkFromMail();
    const [row] = await db.select().from(customerLoginTokens);
    expect(row.email).toBe("anna@example.com");
    expect(row.tokenHash).not.toContain(token);
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now() + 25 * 60_000);
  });

  it("заказов нет или они только неоплаченные — письма нет, ответ тот же «не limited»", async () => {
    await order({ status: "expired" });
    expect(await requestLoginLink("anna@example.com", nextIp(), db)).toBe("skipped");
    expect(await requestLoginLink("nobody@example.com", nextIp(), db)).toBe("skipped");
    expect(sendMail).not.toHaveBeenCalled();
    expect(await db.select().from(customerLoginTokens)).toEqual([]);
  });

  it("лимиты: 3 запроса на адрес и 5 с IP в час", async () => {
    await order();
    for (let i = 0; i < 3; i++) expect(await requestLoginLink("anna@example.com", nextIp(), db)).toBe("sent");
    expect(await requestLoginLink("anna@example.com", nextIp(), db)).toBe("limited");
    const one = "8.8.8.8";
    for (let i = 0; i < 5; i++) expect(await requestLoginLink(`x${i}@example.com`, one, db)).toBe("skipped");
    expect(await requestLoginLink("y@example.com", one, db)).toBe("limited");
  });
});

describe("consumeLoginToken", () => {
  it("ссылка работает один раз", async () => {
    await order();
    await requestLoginLink("anna@example.com", nextIp(), db);
    const token = linkFromMail();
    expect(await consumeLoginToken(token, db)).toBe("anna@example.com");
    expect(await consumeLoginToken(token, db)).toBeNull();
  });

  it("истёкшая, чужая и кривая ссылка — null", async () => {
    await order();
    await requestLoginLink("anna@example.com", nextIp(), db);
    const token = linkFromMail();
    await db.update(customerLoginTokens).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await consumeLoginToken(token, db)).toBeNull();
    expect(await consumeLoginToken("b".repeat(43), db)).toBeNull();
    expect(await consumeLoginToken("short", db)).toBeNull();
  });
});

describe("listCustomerOrders", () => {
  it("предстоящие оплаченные — по возрастанию даты; прошедшие и отменённые — отдельно; чужие и неоплаченные не видны", async () => {
    const later = await order({ startsAt: new Date(Date.now() + 10 * 24 * H) });
    const sooner = await order({ startsAt: new Date(Date.now() + 2 * 24 * H) });
    const past = await order({ status: "done", startsAt: new Date(Date.now() - 24 * H) });
    const cancelled = await order({ status: "cancelled", refundedAmount: 2270 });
    await order({ status: "expired" });
    await order({ status: "awaiting_payment" });
    await order({ email: "other@example.com" });

    const { upcoming, past: rest } = await listCustomerOrders("ANNA@example.com", db);
    expect(upcoming.map((o) => o.accessToken)).toEqual([sooner.accessToken, later.accessToken]);
    expect(rest.map((o) => o.accessToken).sort()).toEqual([past.accessToken, cancelled.accessToken].sort());
    expect(rest.find((o) => o.status === "cancelled")!.refundedAmount).toBe(2270);
  });
});
