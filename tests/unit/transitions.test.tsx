// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TicketCard } from "@/components/site/TicketCard";
import { BACK_TO_CATALOG, NAV_BACK, NAV_FORWARD, OPEN_TOUR } from "@/components/site/transitions";

afterEach(cleanup);

const root = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");
const css = read("src/app/(site)/site.css");
const transitions = read("src/components/site/transitions.tsx");

describe("переходы между страницами: код и стили согласованы", () => {
  it("у каждого класса анимации из transitions.tsx есть правила в site.css", () => {
    // классы — значения в картах enter/exit/share: "nav-forward": "nav-forward", "tour-cover": "morph"
    const classes = new Set([...transitions.matchAll(/"[\w-]+":\s*"([\w-]+)"/g)].map((m) => m[1]).filter((c) => c !== "none"));
    expect([...classes].sort()).toEqual(["morph", "nav-back", "nav-forward"]);
    for (const c of ["nav-forward", "nav-back"]) {
      expect(css, c).toContain(`::view-transition-old(.${c})`);
      expect(css, c).toContain(`::view-transition-new(.${c})`);
    }
    expect(css).toContain("::view-transition-group(.morph)");
  });

  it("типы ссылок: вглубь и назад, обложка перетекает только вместе с направлением", () => {
    expect(NAV_FORWARD).toEqual(["nav-forward"]);
    expect(NAV_BACK).toEqual(["nav-back"]);
    expect(OPEN_TOUR).toEqual(["nav-forward", "tour-cover"]);
    expect(BACK_TO_CATALOG).toEqual(["nav-back", "tour-cover"]);
  });

  it("шапка закреплена на время перехода: имя в SiteHeader совпадает с правилами в CSS", () => {
    expect(read("src/components/site/SiteHeader.tsx")).toContain('viewTransitionName: "site-header"');
    expect(css).toContain("::view-transition-group(site-header){animation:none");
  });

  it("при «уменьшить движение» переходы мгновенные, клики во время перехода не теряются", () => {
    const reduce = css.slice(css.indexOf("@media (prefers-reduced-motion:reduce)"));
    expect(reduce).toMatch(/::view-transition-group\(\*\)\{animation-duration:0s!important/);
    expect(css).toContain("::view-transition{pointer-events:none}");
  });

  it("движение на странице — только на экране и без «уменьшить движение»", () => {
    const motion = css.slice(css.indexOf("26. Движение на странице"), css.indexOf("27. Без анимаций и печать"));
    const queries = [...motion.matchAll(/@media ([^{]+)\{/g)].map((m) => m[1].trim());
    expect(queries.length).toBeGreaterThan(0);
    for (const q of queries) expect(q).toMatch(/^screen and \(prefers-reduced-motion:no-preference\)/);
  });

  it("Next.js отключает плавную прокрутку на время перехода (иначе новая страница «доезжает» до верха)", () => {
    expect(read("src/app/(site)/layout.tsx")).toContain('data-scroll-behavior="smooth"');
  });
});

describe("TicketCard с перетеканием обложки", () => {
  const tour = {
    title: "Тайна первой крепости", subtitle: "", route: "", description: "", note: "",
    durationLabel: "2 часа", ageLabel: "6+", coverUrl: null, priceChild: 2200, priceAdult: 2200, featured: false,
  };

  it("обложка и ссылки на месте и с обёрткой перехода, и без неё", () => {
    for (const morphSlug of ["tayna", undefined]) {
      const { container } = render(<TicketCard tour={tour} sessions={[]} href="/tours/tayna" morphSlug={morphSlug} linkTransition={OPEN_TOUR} />);
      expect(container.querySelector(".ticket > .ticket-photo")).not.toBeNull();
      expect(screen.getByRole("link", { name: "Тайна первой крепости" }).getAttribute("href")).toBe("/tours/tayna");
      cleanup();
    }
  });
});
