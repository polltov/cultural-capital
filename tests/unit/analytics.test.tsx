// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";

const nav = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
// Счётчик «создан»: в коде METRIKA_ID пуст, пока владелец его не заполнит.
vi.mock("@/lib/analytics", async (orig) => ({ ...(await orig<typeof import("@/lib/analytics")>()), METRIKA_ID: "123" }));

import { Analytics } from "@/components/site/Analytics";
import { contactChannel, isPrivatePath } from "@/lib/analytics";

function visit(path: string, referrer = "") {
  nav.pathname = path.split("?")[0];
  window.history.replaceState(null, "", path);
  Object.defineProperty(document, "referrer", { value: referrer, configurable: true });
}

function clearCookies() {
  for (const c of document.cookie.split(";")) {
    const name = c.split("=")[0].trim();
    if (name) document.cookie = `${name}=; Max-Age=0; Path=/`;
  }
}

const calls = () => (window.ym?.a ?? []).map((a) => a.slice(1));

beforeEach(() => {
  localStorage.clear();
  clearCookies();
  delete window.ym;
  document.head.querySelectorAll("script").forEach((s) => s.remove());
});
afterEach(cleanup);

describe("isPrivatePath / contactChannel", () => {
  it("закрытые адреса — билет и кабинет", () => {
    expect(isPrivatePath("/order/abc")).toBe(true);
    expect(isPrivatePath("/account")).toBe(true);
    expect(isPrivatePath("/account/login/xyz")).toBe(true);
    expect(isPrivatePath("/")).toBe(false);
    expect(isPrivatePath("/orders-info")).toBe(false);
  });
  it("распознаёт контакты", () => {
    expect(contactChannel("https://t.me/kultstolica")).toBe("telegram");
    expect(contactChannel("https://wa.me/79991234567")).toBe("whatsapp");
    expect(contactChannel("https://vk.com/kultstolica")).toBe("vk");
    expect(contactChannel("tel:+79219277383")).toBe("phone");
    expect(contactChannel("mailto:a@b.ru")).toBe("email");
    expect(contactChannel("/afisha")).toBeNull();
  });
});

describe("Analytics: источник визита", () => {
  it("запоминает UTM-метки страницы входа в cookie kc_src", () => {
    visit("/tours/egypt?utm_source=vk&utm_medium=cpc&utm_campaign=zima", "https://vk.com/");
    render(<Analytics />);
    const raw = document.cookie.split("; ").find((c) => c.startsWith("kc_src="))!.slice("kc_src=".length);
    expect(JSON.parse(decodeURIComponent(raw))).toMatchObject({ source: "vk", medium: "cpc", campaign: "zima", referrer: "vk.com" });
  });

  it("прямой заход прежний источник не затирает; на странице билета ничего не пишется", () => {
    document.cookie = "kc_src=keep; Path=/";
    visit("/afisha");
    render(<Analytics />);
    cleanup();
    visit("/order/secret?utm_source=mail", "https://e.mail.ru/");
    render(<Analytics />);
    expect(document.cookie).toContain("kc_src=keep");
  });
});

describe("Analytics: Яндекс Метрика с согласия", () => {
  it("до решения — плашка и никакого счётчика", () => {
    visit("/");
    render(<Analytics />);
    expect(screen.getByRole("region", { name: "Согласие на аналитику" })).toBeTruthy();
    expect(window.ym).toBeUndefined();
    expect(document.head.querySelector("script[src*='mc.yandex.ru']")).toBeNull();
  });

  it("«Разрешить» загружает счётчик без Вебвизора и карты кликов и отправляет просмотр", () => {
    visit("/tours/egypt?utm_source=vk", "https://vk.com/");
    render(<Analytics />);
    fireEvent.click(screen.getByRole("button", { name: "Разрешить" }));
    expect(screen.queryByRole("region", { name: "Согласие на аналитику" })).toBeNull();
    expect(localStorage.getItem("kc-analytics")).toBe("yes");
    expect(document.head.querySelector("script[src='https://mc.yandex.ru/metrika/tag.js']")).not.toBeNull();
    expect(calls()).toEqual([
      ["init", { defer: true, clickmap: false, trackLinks: false, accurateTrackBounce: true, webvisor: false }],
      ["hit", "http://localhost:3000/tours/egypt?utm_source=vk", { referer: "https://vk.com/" }],
    ]);
  });

  it("«Отказаться» — счётчика нет, плашка больше не показывается", () => {
    visit("/");
    render(<Analytics />);
    fireEvent.click(screen.getByRole("button", { name: "Отказаться" }));
    expect(localStorage.getItem("kc-analytics")).toBe("no");
    expect(window.ym).toBeUndefined();
    cleanup();
    render(<Analytics />);
    expect(screen.queryByRole("region", { name: "Согласие на аналитику" })).toBeNull();
  });

  it("переходы по сайту — новые просмотры; страница билета в Метрику не уходит", () => {
    localStorage.setItem("kc-analytics", "yes");
    visit("/");
    const { rerender } = render(<Analytics />);
    act(() => visit("/afisha"));
    rerender(<Analytics />);
    act(() => visit("/order/secret-token"));
    rerender(<Analytics />);
    const hits = calls().filter((c) => c[0] === "hit").map((c) => c[1]);
    expect(hits).toEqual(["http://localhost:3000/", "http://localhost:3000/afisha"]);
    expect(JSON.stringify(calls())).not.toContain("secret-token");
  });

  it("на странице билета нет ни плашки, ни счётчика", () => {
    visit("/order/secret-token");
    render(<Analytics />);
    expect(screen.queryByRole("region", { name: "Согласие на аналитику" })).toBeNull();
    expect(window.ym).toBeUndefined();
  });

  it("клик по контакту — цель contact_click с каналом", () => {
    localStorage.setItem("kc-analytics", "yes");
    visit("/");
    render(
      <>
        <a href="https://t.me/kultstolica">Написать</a>
        <Analytics />
      </>,
    );
    fireEvent.click(screen.getByText("Написать"));
    expect(calls()).toContainEqual(["reachGoal", "contact_click", { channel: "telegram" }]);
  });
});
