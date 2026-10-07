import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, type Db } from "@/db/client";
import { orders, tours, tourSessions } from "@/db/schema";
import { loadTicket, sendCancelled, sendSorry, sendTicket } from "@/server/ticket";
import { sendMail } from "@/server/mail/send";
import { formatRub } from "@/lib/domain/pricing";

vi.mock("@/server/mail/send", () => ({ sendMail: vi.fn() }));
const send = vi.mocked(sendMail);

const STARTS = new Date("2026-10-04T08:00:00Z");

async function setup(o: { accessToken?: string | null; email?: string | null; number?: number; refundedAmount?: number } = {}) {
  const [t] = await db.insert(tours).values({
    slug: "a", title: "Египетский зал", durationLabel: "2 часа", ageLabel: "6+", priceChild: 1000, priceAdult: 1270, published: true,
    meetingPoint: "У главного входа", whatToBring: "Вода",
  }).returning();
  const [s] = await db.insert(tourSessions).values({ tourId: t.id, startsAt: STARTS, capacity: 8 }).returning();
  const [r] = await db.insert(orders).values({
    sessionId: s.id, customerName: "Анна", phone: "+79111234567", priceChildSnapshot: 1000, priceAdultSnapshot: 1270, total: 3270,
    consentAt: new Date(), children: 2, adults: 1, status: "paid", number: o.number ?? 57,
    accessToken: o.accessToken === undefined ? "tok_abc" : o.accessToken,
    email: o.email === undefined ? "anna@example.com" : o.email,
    refundedAmount: o.refundedAmount ?? 0,
  }).returning();
  return r;
}
const sentAt = async (id: number) => (await db.select().from(orders).where(eq(orders.id, id)))[0].ticketSentAt;

beforeEach(() => {
  vi.stubEnv("SITE_URL", "https://x.test");
  send.mockReset();
  send.mockResolvedValue(true);
});
afterEach(() => vi.unstubAllEnvs());

describe("loadTicket", () => {
  it("собирает данные билета из заказа, сеанса и экскурсии", async () => {
    const o = await setup();
    expect(await loadTicket(o.id, db)).toEqual({
      orderId: o.id, number: "КС-0057", tourTitle: "Египетский зал", startsAt: STARTS, meetingPoint: "У главного входа",
      whatToBring: "Вода", children: 2, adults: 1, total: 3270, name: "Анна", email: "anna@example.com",
      url: "https://x.test/order/tok_abc",
    });
  });

  it("без SITE_URL ссылка ведёт на localhost", async () => {
    vi.stubEnv("SITE_URL", "");
    const o = await setup();
    expect((await loadTicket(o.id, db))!.url).toBe("http://localhost:3000/order/tok_abc");
  });

  it("SITE_URL без схемы и со слешем в конце — ссылка всё равно правильная", async () => {
    vi.stubEnv("SITE_URL", " kc.example/ ");
    const o = await setup();
    expect((await loadTicket(o.id, db))!.url).toBe("https://kc.example/order/tok_abc");
  });

  it("null: заказа нет, нет токена или нет email (старые заявки)", async () => {
    expect(await loadTicket(9999, db)).toBeNull();
    const noToken = await setup({ accessToken: null });
    expect(await loadTicket(noToken.id, db)).toBeNull();
  });

  it("null: у заказа нет email", async () => {
    const o = await setup({ email: null });
    expect(await loadTicket(o.id, db)).toBeNull();
  });
});

describe("sendTicket", () => {
  it("успех: письмо на email клиента и ticket_sent_at", async () => {
    const o = await setup();
    expect(await sentAt(o.id)).toBeNull();
    expect(await sendTicket(o.id, "paid", db)).toBe(true);

    expect(send).toHaveBeenCalledTimes(1);
    const mail = send.mock.calls[0][0];
    expect(mail.to).toBe("anna@example.com");
    expect(mail.subject).toBe("Ваш билет КС-0057 — Египетский зал");
    expect(mail.html).toContain("https://x.test/order/tok_abc");
    expect(await sentAt(o.id)).toBeInstanceOf(Date);
  });

  it("moved: письмо о переносе", async () => {
    const o = await setup();
    expect(await sendTicket(o.id, "moved", db)).toBe(true);
    expect(send.mock.calls[0][0].subject).toBe("Билет КС-0057 перенесён");
  });

  it("повторная отправка обновляет ticket_sent_at", async () => {
    const o = await setup();
    await db.update(orders).set({ ticketSentAt: new Date(0) }).where(eq(orders.id, o.id));
    expect(await sendTicket(o.id, "paid", db)).toBe(true);
    expect((await sentAt(o.id))!.getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it("sendMail вернул false: false и ticket_sent_at не ставится", async () => {
    const o = await setup();
    send.mockResolvedValue(false);
    expect(await sendTicket(o.id, "paid", db)).toBe(false);
    expect(await sentAt(o.id)).toBeNull();
  });

  it("нет данных билета: false, письмо не отправляется", async () => {
    const o = await setup({ email: null });
    expect(await sendTicket(o.id, "paid", db)).toBe(false);
    expect(await sendTicket(9999, "paid", db)).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("ошибки БД и почты не пробрасываются", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const broken = { select: () => { throw new Error("db down"); } } as unknown as Db;
      expect(await sendTicket(1, "paid", broken)).toBe(false);

      const o = await setup();
      send.mockRejectedValue(new Error("mail down"));
      expect(await sendTicket(o.id, "paid", db)).toBe(false);
      expect(await sentAt(o.id)).toBeNull();
      expect(error).toHaveBeenCalledTimes(2);
    } finally {
      error.mockRestore();
    }
  });

  it("в лог — только текст ошибки: ссылка со страницей заказа (в ней токен) туда не попадает", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const o = await setup();
      // Так выглядит, например, TypeError из new URL(): адрес лежит в поле `input`.
      send.mockRejectedValue(Object.assign(new TypeError("Invalid URL"), { input: "https://x.test/order/tok_abc" }));
      expect(await sendTicket(o.id, "paid", db)).toBe(false);
      expect(error).toHaveBeenCalledTimes(1);
      expect(error.mock.calls[0].map(String).join(" ")).toContain("Invalid URL");
      expect(JSON.stringify(error.mock.calls)).not.toContain("tok_abc");
    } finally {
      error.mockRestore();
    }
  });
});

describe("sendCancelled", () => {
  it("письмо об отмене с суммой возврата из заказа; ticket_sent_at не трогает", async () => {
    const o = await setup({ refundedAmount: 1635 });
    expect(await sendCancelled(o.id, db)).toBe(true);
    const mail = send.mock.calls[0][0];
    expect(mail.to).toBe("anna@example.com");
    expect(mail.subject).toBe("Заказ КС-0057 отменён");
    expect(mail.html).toContain(formatRub(1635));
    expect(await sentAt(o.id)).toBeNull();
  });

  it("возврата нет — письмо «без возврата»", async () => {
    const o = await setup();
    expect(await sendCancelled(o.id, db)).toBe(true);
    expect(send.mock.calls[0][0].html).toContain("Заказ отменён без возврата");
  });

  it("false при неудаче отправки и при отсутствии данных", async () => {
    const o = await setup();
    send.mockResolvedValue(false);
    expect(await sendCancelled(o.id, db)).toBe(false);
    expect(await sendCancelled(9999, db)).toBe(false);
  });
});

describe("sendSorry", () => {
  it("письмо-извинение", async () => {
    const o = await setup();
    expect(await sendSorry(o.id, db)).toBe(true);
    const mail = send.mock.calls[0][0];
    expect(mail.to).toBe("anna@example.com");
    expect(mail.subject).toBe("Извините, места закончились — заказ КС-0057");
    expect(mail.html).toContain("https://x.test/#catalog");
    expect(await sentAt(o.id)).toBeNull();
  });

  it("false при неудаче отправки и при отсутствии данных", async () => {
    const o = await setup();
    send.mockResolvedValue(false);
    expect(await sendSorry(o.id, db)).toBe(false);
    expect(await sendSorry(9999, db)).toBe(false);
  });
});
