import { afterEach, describe, expect, it, vi } from "vitest";
import { siteUrl } from "@/lib/site-url";

afterEach(() => vi.unstubAllEnvs());

describe("siteUrl", () => {
  it.each([
    [undefined, "http://localhost:3000"],
    ["", "http://localhost:3000"],
    ["   ", "http://localhost:3000"],
    ["https://kc.example", "https://kc.example"],
    ["https://kc.example/", "https://kc.example"],
    ["https://kc.example///", "https://kc.example"],
    ["  https://kc.example/ \n", "https://kc.example"],
    ["kc.example", "https://kc.example"],
    ["kc.example/", "https://kc.example"],
    ["http://localhost:3000/", "http://localhost:3000"],
    ["HTTPS://KC.example", "https://kc.example"],
    // кириллический домен — в punycode, чтобы ссылка открывалась в любой почте и мессенджере
    ["https://культурнаястолица.рф", "https://xn--80aaxgfbmjpmhegc7c3esc.xn--p1ai"],
    ["КультурнаяСтолица.РФ/", "https://xn--80aaxgfbmjpmhegc7c3esc.xn--p1ai"],
    ["https://www.культурная-столица.рф/", "https://www.xn----7sbb5ahgcnlqohfgc1d4evc.xn--p1ai"],
    ["https://xn--80aaxgfbmjpmhegc7c3esc.xn--p1ai", "https://xn--80aaxgfbmjpmhegc7c3esc.xn--p1ai"],
  ])("SITE_URL=%j → %s", (value, expected) => {
    vi.stubEnv("SITE_URL", value);
    expect(siteUrl()).toBe(expected);
  });
});
