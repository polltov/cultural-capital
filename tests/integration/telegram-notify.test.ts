import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { orders, tours, tourSessions } from "@/db/schema";
import { formatRub } from "@/lib/domain/pricing";
import { notifyPaidOrder } from "@/server/telegram";

const fetchMock = vi.fn();

async function setup() {
  const [t] = await db.insert(tours).values({ slug: "a", title: "Египетский зал", durationLabel: "2 часа", ageLabel: "6+", priceChild: 1000, priceAdult: 1270, published: true }).returning();
  const [s] = await db.insert(tourSessions).values({ tourId: t.id, startsAt: new Date("2026-10-04T08:00:00Z"), capacity: 8 }).returning();
  const [o] = await db.insert(orders).values({
    sessionId: s.id, customerName: "Анна <b>", phone: "+79991234567", priceChildSnapshot: 1000, priceAdultSnapshot: 1270, total: 3270,
    consentAt: new Date(), children: 2, adults: 1, status: "paid", number: 57, accessToken: "tok_secret_access", email: "anna@example.com",
  }).returning();
  return o;
}

const sentBody = () => JSON.parse(fetchMock.mock.calls[0][1].body);

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "bot-token");
  vi.stubEnv("TELEGRAM_CHAT_ID", "42");
  vi.stubEnv("SITE_URL", "https://x.test/"); // слеш в конце не должен дать «//admin»
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("notifyPaidOrder", () => {
  it("sends the paid-order message with an admin link and without the order access token", async () => {
    const o = await setup();
    await notifyPaidOrder(o.id, db);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.telegram.org/botbot-token/sendMessage");
    const body = sentBody();
    expect(body).toMatchObject({ chat_id: "42", parse_mode: "HTML" });
    const lines = (body.text as string).split("\n");
    expect(lines[0]).toBe(`<b>Оплачен заказ КС-0057 · ${formatRub(3270)}</b>`);
    expect(body.text).toContain("Египетский зал");
    expect(body.text).toContain("вс, 4 октября 2026, 11:00");
    expect(body.text).toContain("2 детских + 1 взрослый");
    expect(body.text).toContain("Анна &lt;b&gt;, +79991234567");
    expect(lines.at(-1)).toBe(`https://x.test/admin/orders/${o.id}`);
    expect(body.text).not.toContain("tok_secret_access");
  });

  it("an unknown order sends nothing", async () => {
    await notifyPaidOrder(9999, db);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("without Telegram settings it only warns", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const o = await setup();
      await notifyPaidOrder(o.id, db);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  it("never throws: a failed send is logged", async () => {
    const o = await setup();
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(notifyPaidOrder(o.id, db)).resolves.toBeUndefined();
      expect(err).toHaveBeenCalledTimes(1);
      expect(err.mock.calls.flat().map(String).join("\n")).not.toContain("tok_secret_access");
    } finally {
      err.mockRestore();
    }
  });
});
