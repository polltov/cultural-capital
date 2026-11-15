import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendMail, smtpConfig, type MailTransport } from "@/server/mail/send";

const mail = { to: "anna@example.com", subject: "Тема", html: "<p>Привет</p>", text: "Привет" };

let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv("SMTP_HOST", "smtp.yandex.ru");
  vi.stubEnv("SMTP_PORT", "");
  vi.stubEnv("SMTP_USER", "tickets@x.test");
  vi.stubEnv("SMTP_PASSWORD", "smtp-secret-pass");
  vi.stubEnv("MAIL_FROM", "Культурная Столица <tickets@x.test>");
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  error = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const logged = () => JSON.stringify([...warn.mock.calls, ...error.mock.calls]);
const transport = (impl: MailTransport["sendMail"] = async () => ({ messageId: "m1" })) => ({ sendMail: vi.fn(impl) });

describe("smtpConfig", () => {
  it("порт по умолчанию 465", () => {
    expect(smtpConfig()).toEqual({ host: "smtp.yandex.ru", port: 465, user: "tickets@x.test", pass: "smtp-secret-pass" });
  });
  it("свой порт", () => {
    vi.stubEnv("SMTP_PORT", "587");
    expect(smtpConfig()?.port).toBe(587);
  });
  it("null без хоста, логина, пароля или с кривым портом", () => {
    for (const [k, v] of [["SMTP_HOST", ""], ["SMTP_USER", " "], ["SMTP_PASSWORD", ""], ["SMTP_PORT", "abc"]]) {
      vi.stubEnv(k, v);
      expect(smtpConfig()).toBeNull();
      vi.unstubAllEnvs();
      vi.stubEnv("SMTP_HOST", "smtp.yandex.ru");
      vi.stubEnv("SMTP_USER", "tickets@x.test");
      vi.stubEnv("SMTP_PASSWORD", "smtp-secret-pass");
    }
  });
});

describe("sendMail", () => {
  it("успех: true, письмо от MAIL_FROM с html и текстом", async () => {
    const t = transport();
    await expect(sendMail(mail, t)).resolves.toBe(true);
    expect(t.sendMail).toHaveBeenCalledTimes(1);
    expect(t.sendMail.mock.calls[0][0]).toEqual({
      from: "Культурная Столица <tickets@x.test>", to: "anna@example.com", subject: "Тема", html: "<p>Привет</p>", text: "Привет",
    });
    expect(error).not.toHaveBeenCalled();
  });

  it("без SMTP_HOST: false, ничего не отправляется, предупреждение", async () => {
    vi.stubEnv("SMTP_HOST", "");
    await expect(sendMail(mail)).resolves.toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
  });

  it("без MAIL_FROM: false, транспорт не вызывается, предупреждение", async () => {
    vi.stubEnv("MAIL_FROM", "");
    const t = transport();
    await expect(sendMail(mail, t)).resolves.toBe(false);
    expect(t.sendMail).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("отказ сервера: false и error в логе с кодом, без пароля и тела письма", async () => {
    const t = transport(async () => {
      throw Object.assign(new Error("Invalid login: 535 5.7.8 authentication failed"), { code: "EAUTH", responseCode: 535 });
    });
    await expect(sendMail(mail, t)).resolves.toBe(false);
    expect(error).toHaveBeenCalledTimes(1);
    const log = logged();
    expect(log).toContain("EAUTH");
    expect(log).toContain("535");
    expect(log).not.toContain("smtp-secret-pass");
    expect(log).not.toContain("Привет");
  });

  it("сеть/таймаут: false, не бросает", async () => {
    const t = transport(async () => {
      throw Object.assign(new Error("Connection timeout"), { code: "ETIMEDOUT" });
    });
    await expect(sendMail(mail, t)).resolves.toBe(false);
    expect(logged()).toContain("ETIMEDOUT");
    expect(logged()).not.toContain("smtp-secret-pass");
  });
});
