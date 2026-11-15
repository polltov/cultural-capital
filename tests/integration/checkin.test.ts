import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, tours, tourSessions } from "@/db/schema";
import { getCheckinOrder, setCheckedIn } from "@/server/checkin";
import { loadOrderPage } from "@/server/order-page";
import { GET as qrRoute } from "@/app/(site)/order/[token]/qr/route";

const TOKEN = "a".repeat(43);

async function setup(over: Partial<typeof orders.$inferInsert> = {}) {
  const [t] = await db.insert(tours).values({ slug: "a", title: "Эрмитаж", durationLabel: "2 часа", ageLabel: "6+", priceChild: 1000, priceAdult: 1270, published: true }).returning();
  const [s] = await db.insert(tourSessions).values({ tourId: t.id, startsAt: new Date(Date.now() + 3600_000), capacity: 8 }).returning();
  const [o] = await db
    .insert(orders)
    .values({
      sessionId: s.id, customerName: "Анна", phone: "+79991234567", email: "anna@example.com", children: 2, adults: 1,
      priceChildSnapshot: 1000, priceAdultSnapshot: 1270, total: 3270, status: "paid", paymentId: "pay-1", paymentStatus: "succeeded",
      paidAt: new Date(), consentAt: new Date(), accessToken: TOKEN, ...over,
    })
    .returning();
  return { t, s, o };
}
const checkedIn = async (id: number) => (await db.select({ v: orders.checkedInAt }).from(orders).where(eq(orders.id, id)))[0].v;

describe("getCheckinOrder", () => {
  it("по токену — заказ с экскурсией и сеансом; чужой формат и неизвестный токен — null", async () => {
    const { o, s } = await setup();
    expect(await getCheckinOrder(TOKEN, db)).toMatchObject({
      id: o.id, number: expect.stringMatching(/^КС-\d{4}$/), status: "paid", customerName: "Анна", children: 2, adults: 1,
      sessionId: s.id, tourTitle: "Эрмитаж", checkedInAt: null,
    });
    expect(await getCheckinOrder("b".repeat(43), db)).toBeNull();
    expect(await getCheckinOrder("short", db)).toBeNull();
    expect(await getCheckinOrder("' or 1=1 --" + "x".repeat(32), db)).toBeNull();
  });
});

describe("setCheckedIn", () => {
  it("отмечает; повторная отметка не сдвигает время; снятие — null", async () => {
    const { o } = await setup();
    const first = await setCheckedIn(o.id, true, db);
    expect(first.ok).toBe(true);
    const at = await checkedIn(o.id);
    expect(at).toBeInstanceOf(Date);

    await new Promise((r) => setTimeout(r, 20));
    await setCheckedIn(o.id, true, db);
    expect((await checkedIn(o.id))!.getTime()).toBe(at!.getTime());

    expect(await setCheckedIn(o.id, false, db)).toEqual({ ok: true, checkedInAt: null });
    expect(await checkedIn(o.id)).toBeNull();
  });

  it.each(["cancelled", "expired", "awaiting_payment"] as const)("заказ «%s» отметить нельзя", async (status) => {
    const { o } = await setup({ status });
    expect(await setCheckedIn(o.id, true, db)).toEqual({ ok: false, error: "Отметить можно только оплаченный заказ" });
    expect(await checkedIn(o.id)).toBeNull();
  });

  it("проведённый (после экскурсии) отметить можно", async () => {
    const { o } = await setup({ status: "done" });
    expect((await setCheckedIn(o.id, true, db)).ok).toBe(true);
  });
});

describe("QR-код билета", () => {
  const call = (token: string) => qrRoute(new Request(`http://x.test/order/${token}/qr`), { params: Promise.resolve({ token }) });

  it("оплаченный заказ: PNG без индексации и общего кэша", async () => {
    await setup();
    const res = await call(TOKEN);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toMatch(/^private/);
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it("отменённый заказ, неизвестный и кривой токен — 404", async () => {
    await setup({ status: "cancelled" });
    expect((await call(TOKEN)).status).toBe(404);
    expect((await call("b".repeat(43))).status).toBe(404);
    expect((await call("../../etc")).status).toBe(404);
  });

  it("страница билета: SVG QR-кода с адресом отметки прихода только у действующего билета", async () => {
    await setup();
    const page = await loadOrderPage(TOKEN, { db });
    expect(page!.data.view).toBe("paid");
    expect(page!.data.qr).toMatch(/^<svg[\s>]/);
    expect(page!.data.ticket.qrImageUrl).toMatch(new RegExp(`/order/${TOKEN}/qr$`));

    await db.update(orders).set({ status: "cancelled" });
    const cancelled = await loadOrderPage(TOKEN, { db });
    expect(cancelled!.data.view).toBe("cancelled");
    expect(cancelled!.data.qr).toBeUndefined();
  });
});
