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
    ["HTTPS://KC.example", "HTTPS://KC.example"],
  ])("SITE_URL=%j → %s", (value, expected) => {
    vi.stubEnv("SITE_URL", value);
    expect(siteUrl()).toBe(expected);
  });
});
