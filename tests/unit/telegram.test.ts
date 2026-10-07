import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { buildPaidOrderMessage, notifyAlert } from "@/server/telegram";
import { formatRub } from "@/lib/domain/pricing";

const paid = {
  number: "КС-0057", tourTitle: "Египетский зал Эрмитажа", startsAt: new Date("2026-10-04T08:00:00Z"),
  children: 2, adults: 1, total: 3270, name: "Анна", phone: "+79991234567", adminUrl: "https://x.test/admin/orders/57",
};

describe("buildPaidOrderMessage", () => {
  it("first line is the bold headline with number and total", () => {
    expect(buildPaidOrderMessage(paid).split("\n")[0]).toBe(`<b>Оплачен заказ КС-0057 · ${formatRub(3270)}</b>`);
  });
  it("contains key facts and the admin link", () => {
    const m = buildPaidOrderMessage(paid);
    for (const s of ["Египетский зал Эрмитажа", "вс, 4 октября 2026, 11:00", "2 детских + 1 взрослый", "Анна, +79991234567", "https://x.test/admin/orders/57"]) {
      expect(m).toContain(s);
    }
  });
  it("escapes html in name, tour title and phone", () => {
    const m = buildPaidOrderMessage({ ...paid, name: "<script>x</script>", tourTitle: "a & b", phone: "<b>" });
    expect(m).not.toContain("<script>");
    expect(m).toContain("&lt;script&gt;");
    expect(m).toContain("a &amp; b");
    expect(m).toContain("&lt;b&gt;");
  });
});

describe("notifyAlert", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "bot-token");
    vi.stubEnv("TELEGRAM_CHAT_ID", "42");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("sends the text with a warning prefix as escaped HTML", async () => {
    await notifyAlert("Сумма платежа не совпала с заказом КС-0057 <&>");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.telegram.org/botbot-token/sendMessage");
    expect(JSON.parse(init.body)).toMatchObject({
      chat_id: "42", parse_mode: "HTML", text: "⚠️ Сумма платежа не совпала с заказом КС-0057 &lt;&amp;&gt;",
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("does nothing without Telegram settings", async () => {
    vi.stubEnv("TELEGRAM_CHAT_ID", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await notifyAlert("x");
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("never throws: network and HTTP errors are logged", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      fetchMock.mockRejectedValueOnce(new Error("offline"));
      await expect(notifyAlert("x")).resolves.toBeUndefined();
      fetchMock.mockResolvedValueOnce(new Response("bad", { status: 500 }));
      await expect(notifyAlert("x")).resolves.toBeUndefined();
      expect(err).toHaveBeenCalledTimes(2);
    } finally {
      err.mockRestore();
    }
  });
});
