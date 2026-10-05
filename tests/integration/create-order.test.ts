import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { tours, tourSessions, orders } from "@/db/schema";
import { createOrder } from "@/server/orders";

const H = 3600_000;
const valid = { children: 2, adults: 1, name: "Анна", phone: "8 (999) 123-45-67", email: "", comment: "", consent: true, website: "" };

async function setup(o: { published?: boolean; hidden?: boolean; offset?: number; capacity?: number } = {}) {
  const [t] = await db.insert(tours).values({ slug: "a", title: "A", durationLabel: "2 часа", ageLabel: "6+", priceChild: 1000, priceAdult: 1270, published: o.published ?? true }).returning();
  const [s] = await db.insert(tourSessions).values({ tourId: t.id, startsAt: new Date(Date.now() + (o.offset ?? 24) * H), hidden: o.hidden ?? false, capacity: o.capacity ?? 8 }).returning();
  return { t, s };
}

describe("createOrder", () => {
  it("creates order with snapshots", async () => {
    const { t, s } = await setup();
    const r = await createOrder({ ...valid, sessionId: s.id }, "1.1.1.1", db);
    expect(r).toMatchObject({ ok: true, number: "КС-0001" });
    await db.update(tours).set({ priceChild: 5000 }).where(eq(tours.id, t.id));
    const [o] = await db.select().from(orders);
    expect(o.status).toBe("new");
    expect(o.total).toBe(3270);
    expect(o.priceChildSnapshot).toBe(1000);
    expect(o.phone).toBe("+79991234567");
    expect(o.email).toBeNull();
  });

  it.each([
    ["missing session", async () => ({ sessionId: 9999 })],
    ["past session", async () => ({ sessionId: (await setup({ offset: -24 })).s.id })],
    ["hidden session", async () => ({ sessionId: (await setup({ hidden: true })).s.id })],
    ["unpublished tour", async () => ({ sessionId: (await setup({ published: false })).s.id })],
  ])("rejects %s", async (_n, mk) => {
    const extra = await mk();
    const r = await createOrder({ ...valid, ...extra }, "1.1.1.1", db);
    expect(r.ok).toBe(false);
    expect((r as { error?: string }).error).toBeTruthy();
    expect(await db.select().from(orders)).toHaveLength(0);
  });

  it("rejects when not enough seats", async () => {
    const { s } = await setup({ capacity: 8 });
    await db.insert(orders).values({ sessionId: s.id, customerName: "X", phone: "+7", priceChildSnapshot: 1, priceAdultSnapshot: 1, total: 1, consentAt: new Date(), children: 6, adults: 0, status: "confirmed" });
    const r = await createOrder({ ...valid, sessionId: s.id }, "1.1.1.1", db);
    expect(r).toEqual({ ok: false, error: "Осталось мест: 2" });
  });

  it("honeypot: no insert, no error, no rate hit", async () => {
    const { s } = await setup();
    const r = await createOrder({ ...valid, sessionId: s.id, website: "http://spam" }, "1.1.1.1", db);
    expect(r).toEqual({ ok: false });
    expect(await db.select().from(orders)).toHaveLength(0);
  });

  it("field errors", async () => {
    const { s } = await setup();
    const a = await createOrder({ ...valid, sessionId: s.id, phone: "12345" }, "1.1.1.1", db);
    expect(a.ok === false && a.fieldErrors?.phone).toBe("Проверьте номер телефона");
    const b = await createOrder({ ...valid, sessionId: s.id, consent: false }, "1.1.1.1", db);
    expect(b.ok === false && b.fieldErrors?.consent).toBe("Нужно согласие на обработку данных");
    const c = await createOrder({ ...valid, sessionId: s.id, children: 0, adults: 0 }, "1.1.1.1", db);
    expect(c.ok === false && Object.values(c.fieldErrors ?? {})).toContain("Укажите хотя бы одного участника");
  });

  it("6th order from one IP in an hour is limited; invalid input does not burn quota", async () => {
    const { s } = await setup();
    for (let i = 0; i < 3; i++) await createOrder({ ...valid, sessionId: s.id, phone: "1" }, "2.2.2.2", db);
    for (let i = 0; i < 5; i++) expect((await createOrder({ ...valid, sessionId: s.id, children: 1, adults: 0 }, "2.2.2.2", db)).ok).toBe(true);
    const r = await createOrder({ ...valid, sessionId: s.id }, "2.2.2.2", db);
    expect(r).toEqual({ ok: false, error: "Слишком много заявок. Попробуйте позже или позвоните нам." });
  });
});

describe("createOrder validation messages", () => {
  it("out-of-range sessionId returns ok:false without throwing", async () => {
    const r = await createOrder({ ...valid, sessionId: 3000000000 }, "3.3.3.3", db);
    expect(r.ok).toBe(false);
  });

  it("all field errors are in Russian", async () => {
    const bad: Record<string, unknown>[] = [
      { sessionId: "abc" }, { sessionId: -1 }, { sessionId: 1.5 }, { sessionId: null }, { sessionId: 3000000000 },
      { children: 21 }, { children: -1 }, { children: "x" }, { children: 1.5 }, { adults: 99 },
      { phone: 123 }, { phone: null }, { phone: "12345" }, { name: 5 }, { name: "" }, { name: "x".repeat(81) },
      { consent: "yes" }, { consent: false }, { consent: undefined }, { email: "nope" }, { email: 5 },
      { comment: "x".repeat(1001) }, { comment: 5 }, { children: 0, adults: 0 },
    ];
    for (const b of bad) {
      const r = await createOrder({ ...valid, sessionId: 1, ...b }, "4.4.4.4", db);
      expect(r.ok).toBe(false);
      const msgs = Object.values((r as { fieldErrors?: Record<string, string> }).fieldErrors ?? {});
      expect(msgs.length, JSON.stringify(b)).toBeGreaterThan(0);
      for (const m of msgs) expect(m, JSON.stringify(b)).toMatch(/[а-яё]/i);
    }
  });
});
