import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendMail } from "@/server/mail/send";

const mail = { to: "anna@example.com", subject: "Тема", html: "<p>Привет</p>", text: "Привет" };

let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv("RESEND_API_KEY", "re_secret_key");
  vi.stubEnv("MAIL_FROM", "Культурная Столица <tickets@x.test>");
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  error = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const logged = () => JSON.stringify([...warn.mock.calls, ...error.mock.calls]);

describe("sendMail", () => {
  it("200: true, POST в Resend с Bearer-ключом и нужным телом, таймаут 10 с", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json({ id: "e1" }, { status: 200 }));
    await expect(sendMail(mail, fetchImpl)).resolves.toBe(true);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe("https://api.resend.com/emails");
    expect(init!.method).toBe("POST");
    const headers = new Headers(init!.headers);
    expect(headers.get("Authorization")).toBe("Bearer re_secret_key");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(JSON.parse(String(init!.body))).toEqual({
      from: "Культурная Столица <tickets@x.test>", to: ["anna@example.com"], subject: "Тема", html: "<p>Привет</p>", text: "Привет",
    });
    expect(init!.signal).toBeInstanceOf(AbortSignal);
    expect(error).not.toHaveBeenCalled();
  });

  it("без RESEND_API_KEY: false, fetch не вызывается, предупреждение", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(sendMail(mail, fetchImpl)).resolves.toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
  });

  it("без MAIL_FROM: false, fetch не вызывается, предупреждение", async () => {
    vi.stubEnv("MAIL_FROM", "");
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(sendMail(mail, fetchImpl)).resolves.toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("ответ 500: false и error в логе, без ключа и тела письма", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("upstream boom", { status: 500 }));
    await expect(sendMail(mail, fetchImpl)).resolves.toBe(false);
    expect(error).toHaveBeenCalledTimes(1);
    const log = logged();
    expect(log).toContain("500");
    expect(log).not.toContain("re_secret_key");
    expect(log).not.toContain("Привет");
  });

  it("сетевая ошибка/таймаут: false, не бросает, в логе нет ключа", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });
    await expect(sendMail(mail, fetchImpl)).resolves.toBe(false);
    expect(error).toHaveBeenCalledTimes(1);
    expect(logged()).not.toContain("re_secret_key");
  });

  it("по умолчанию использует глобальный fetch", async () => {
    const spy = vi.fn<typeof fetch>(async () => Response.json({ id: "e1" }));
    vi.stubGlobal("fetch", spy);
    try {
      await expect(sendMail(mail)).resolves.toBe(true);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
