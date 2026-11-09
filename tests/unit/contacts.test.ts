import { describe, it, expect, afterEach } from "vitest";
import { contacts, writeUsHref } from "@/lib/contacts";
import { operator } from "@/lib/legal";

const saved = { ...contacts, email: operator.email };
afterEach(() => {
  contacts.telegram = saved.telegram;
  contacts.whatsapp = saved.whatsapp;
  operator.email = saved.email;
});

describe("writeUsHref", () => {
  it("is null when nothing is filled, so the button is hidden", () => {
    contacts.telegram = "";
    contacts.whatsapp = "";
    operator.email = "";
    expect(writeUsHref()).toBeNull();
  });
  it("prefers Telegram and drops a leading @", () => {
    contacts.telegram = "@kultstolica";
    contacts.whatsapp = "79991234567";
    expect(writeUsHref()).toBe("https://t.me/kultstolica");
  });
  it("falls back to WhatsApp with digits only", () => {
    contacts.telegram = "";
    contacts.whatsapp = "+7 (999) 123-45-67";
    expect(writeUsHref()).toBe("https://wa.me/79991234567");
  });
  it("falls back to the operator e-mail", () => {
    contacts.telegram = "";
    contacts.whatsapp = "";
    operator.email = "hello@example.com";
    expect(writeUsHref()).toBe("mailto:hello@example.com");
  });
});
