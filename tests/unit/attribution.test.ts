import { describe, expect, it } from "vitest";
import { attributionFromVisit, attributionLabel, encodeAttribution, parseAttribution } from "@/lib/attribution";

const SITE = "https://culturaltours.ru";

describe("attributionFromVisit", () => {
  it("берёт UTM-метки из адреса входа и домен сайта-источника", () => {
    expect(
      attributionFromVisit(`${SITE}/tours/egypt?utm_source=vk&utm_medium=cpc&utm_campaign=zima&utm_content=video&utm_term=kvest`, "https://vk.com/feed"),
    ).toEqual({ source: "vk", medium: "cpc", campaign: "zima", content: "video", term: "kvest", referrer: "vk.com" });
  });

  it("без меток — сайт, с которого пришли: поисковик, соцсеть или просто сайт", () => {
    expect(attributionFromVisit(`${SITE}/`, "https://yandex.ru/search/?text=экскурсии")).toMatchObject({ source: "yandex.ru", medium: "organic" });
    expect(attributionFromVisit(`${SITE}/`, "https://www.google.com/")).toMatchObject({ source: "google.com", medium: "organic" });
    expect(attributionFromVisit(`${SITE}/`, "https://t.me/")).toMatchObject({ source: "t.me", medium: "social" });
    expect(attributionFromVisit(`${SITE}/`, "https://kudago.com/spb/")).toMatchObject({ source: "kudago.com", medium: "referral" });
  });

  it("Яндекс Директ с автоматической разметкой: только yclid", () => {
    expect(attributionFromVisit(`${SITE}/?yclid=123`, "")).toMatchObject({ source: "yandex", medium: "cpc" });
  });

  it("прямой заход, переход внутри сайта и возврат со страницы оплаты — не источник", () => {
    expect(attributionFromVisit(`${SITE}/afisha`, "")).toBeNull();
    expect(attributionFromVisit(`${SITE}/afisha`, `${SITE}/`)).toBeNull();
    expect(attributionFromVisit(`${SITE}/afisha`, "https://www.culturaltours.ru/")).toBeNull();
    expect(attributionFromVisit(`${SITE}/tours/egypt`, "https://yoomoney.ru/checkout/payments/v2/contract")).toBeNull();
  });

  it("обрезает длинные метки и убирает управляющие символы", () => {
    const a = attributionFromVisit(`${SITE}/?utm_source=${"x".repeat(300)}&utm_campaign=a%0Ab`, "");
    expect(a?.source).toHaveLength(100);
    expect(a?.campaign).toBe("ab");
  });

  it("испорченный адрес — не источник", () => {
    expect(attributionFromVisit("not a url", "https://vk.com/")).toBeNull();
  });
});

describe("parseAttribution", () => {
  const a = { source: "vk", medium: "cpc", campaign: "zima", content: "", term: "", referrer: "vk.com" };

  it("читает то, что записал encodeAttribution, в закодированном и раскодированном виде", () => {
    expect(parseAttribution(encodeAttribution(a))).toEqual(a);
    expect(parseAttribution(decodeURIComponent(encodeAttribution(a)))).toEqual(a);
  });

  it("на мусор и подделку отвечает null или чистит поля", () => {
    expect(parseAttribution(undefined)).toBeNull();
    expect(parseAttribution("%E0%A4%A")).toBeNull();
    expect(parseAttribution("[]")).toBeNull();
    expect(parseAttribution(JSON.stringify({ medium: "cpc" }))).toBeNull();
    expect(parseAttribution("x".repeat(5000))).toBeNull();
    expect(parseAttribution(JSON.stringify({ source: 42, medium: { a: 1 } }))).toBeNull();
    expect(parseAttribution(JSON.stringify({ source: "  vk\u0000 ", medium: "cpc", extra: "x" }))).toEqual({
      source: "vk", medium: "cpc", campaign: "", content: "", term: "", referrer: "",
    });
  });
});

describe("attributionLabel", () => {
  it("собирает подпись для админки", () => {
    expect(attributionLabel({ source: "vk", medium: "cpc", campaign: "zima" })).toBe("vk / cpc · zima");
    expect(attributionLabel({ source: "yandex.ru", medium: "organic", campaign: null })).toBe("yandex.ru / organic");
    expect(attributionLabel({ source: "partner", medium: "", campaign: "" })).toBe("partner");
    expect(attributionLabel({ source: null, medium: null, campaign: null })).toBe("Прямой заход");
  });
});
