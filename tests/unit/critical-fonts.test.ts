import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CRITICAL_FONTS } from "@/lib/critical-fonts";

const root = path.resolve(__dirname, "../..");
const fontsCss = readFileSync(path.join(root, "src/app/fonts.css"), "utf8");
const siteCss = readFileSync(path.join(root, "src/app/(site)/site.css"), "utf8");

describe("предзагрузка шрифтов", () => {
  it("каждый предзагружаемый файл лежит в public/ и подключён в fonts.css", () => {
    // иначе после обновления шрифтов браузер скачивал бы файл, которым страница не пользуется
    for (const href of CRITICAL_FONTS) {
      expect(existsSync(path.join(root, "public", href)), href).toBe(true);
      expect(fontsCss, href).toContain(`url(${href})`);
    }
  });

  it("предзагружается только кириллица и без повторов", () => {
    expect(new Set(CRITICAL_FONTS).size).toBe(CRITICAL_FONTS.length);
    for (const href of CRITICAL_FONTS) expect(href).toMatch(/-cyrillic-[0-9a-f]+\.woff2$/);
  });
});

describe("запасные шрифты", () => {
  const declared = [...fontsCss.matchAll(/font-family:\s*'([^']+ Fallback[^']*)'/g)].map((m) => m[1]);

  it("у каждого запасного начертания есть системный источник и подгонка ширины", () => {
    const blocks = fontsCss.split("@font-face").filter((b) => /Fallback/.test(b.split(";")[0]));
    expect(blocks.length).toBeGreaterThan(0);
    for (const b of blocks) {
      expect(b).toMatch(/src:\s*local\(/);
      expect(b).not.toMatch(/url\(/);
      expect(b).toMatch(/size-adjust:\s*[\d.]+%/);
    }
  });

  it("все объявленные запасные семейства стоят в списках шрифтов сайта сразу после «своего» шрифта", () => {
    for (const family of new Set(declared)) expect(siteCss, family).toContain(`"${family}"`);
    const stacks = [...siteCss.matchAll(/--(display|accent|serif|sans):([^;]+);/g)].map((m) => m[2].split(",").map((s) => s.trim()));
    expect(stacks).toHaveLength(4);
    for (const stack of stacks) {
      expect(stack[1]).toMatch(/Fallback"$/);
      expect(stack[2]).toMatch(/Fallback Android"$/);
    }
  });
});

describe("цифры Prata", () => {
  // у самого Prata единица неотличима от строчной «l», поэтому цифры подменяются отдельным файлом
  const faces = fontsCss.split("@font-face").filter((b) => /font-family:\s*'Prata'/.test(b));

  it("цифры 0–9 берутся из отдельного файла, и он лежит в public/", () => {
    const digits = faces.find((b) => /unicode-range:\s*U\+0030-0039;/.test(b));
    expect(digits).toBeDefined();
    const file = /url\((\/fonts\/prata-digits-[0-9a-f]+\.woff2)\)/.exec(digits ?? "")?.[1];
    expect(file).toBeDefined();
    expect(existsSync(path.join(root, "public", file ?? ""))).toBe(true);
  });

  it("латинская половинка Prata диапазон цифр не заявляет", () => {
    const latin = faces.find((b) => b.includes("prata-normal-latin"));
    expect(latin).toMatch(/U\+0021-002F, U\+003A-009F/);
    expect(latin).not.toMatch(/U\+0021-009F/);
  });
});
