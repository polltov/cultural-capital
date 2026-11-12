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

import { contactLinks } from "@/lib/contacts";
describe("contactLinks", () => {
  const savedVk = contacts.vk;
  const savedPhone = operator.phone;
  afterEach(() => {
    contacts.vk = savedVk;
    operator.phone = savedPhone;
  });
  it("is empty when nothing is filled", () => {
    contacts.telegram = ""; contacts.whatsapp = ""; contacts.vk = ""; operator.phone = ""; operator.email = "";
    expect(contactLinks()).toEqual([]);
  });
  it("lists filled channels in order with working links", () => {
    contacts.telegram = "https://t.me/kultstolica";
    contacts.whatsapp = "+7 (999) 123-45-67";
    contacts.vk = "kultstolica";
    operator.phone = "8 (812) 123-45-67";
    operator.email = "hello@example.com";
    expect(contactLinks().map((c) => [c.kind, c.value, c.href, c.external])).toEqual([
      ["telegram", "@kultstolica", "https://t.me/kultstolica", true],
      ["whatsapp", "+79991234567", "https://wa.me/79991234567", true],
      ["vk", "vk.com/kultstolica", "https://vk.com/kultstolica", true],
      ["phone", "8 (812) 123-45-67", "tel:+78121234567", false],
      ["email", "hello@example.com", "mailto:hello@example.com", false],
    ]);
  });
  it("keeps a full VK link as is", () => {
    contacts.telegram = ""; contacts.whatsapp = ""; operator.phone = ""; operator.email = "";
    contacts.vk = "https://vk.com/club123";
    expect(contactLinks()).toEqual([{ kind: "vk", label: "ВКонтакте", value: "vk.com/club123", href: "https://vk.com/club123", external: true }]);
  });
});
