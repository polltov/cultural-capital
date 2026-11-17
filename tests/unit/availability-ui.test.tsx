// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { EmptySchedule } from "@/components/site/Afisha";
import { SiteShell } from "@/components/site/SiteShell";
import { contactLinks } from "@/lib/contacts";
import { defaultSiteContent } from "@/lib/site-content";

const { loadPublishedCatalog, getSiteContent } = vi.hoisted(() => ({
  loadPublishedCatalog: vi.fn(),
  getSiteContent: vi.fn(),
}));

vi.mock("@/server/catalog", () => ({ loadPublishedCatalog }));
vi.mock("@/server/site-content", () => ({ getSiteContent }));

const contactSettings = { ...defaultSiteContent.contacts, email: "organizer@example.org" };
const content = { ...defaultSiteContent, contacts: contactSettings };

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("действие в шапке сайта", () => {
  it("предлагает написать организатору, если в афише нет дат", async () => {
    loadPublishedCatalog.mockResolvedValue([{ sessions: [] }]);
    getSiteContent.mockResolvedValue({ content });
    render(await SiteShell({ children: null }));

    const header = within(screen.getByRole("banner"));
    expect(header.queryByRole("link", { name: "Купить билет" })).toBeNull();
    expect(header.getByRole("link", { name: "Запросить экскурсию" }).getAttribute("href"))
      .toBe("mailto:organizer@example.org");
  });

  it("возвращает ссылку покупки при появлении сеанса с местами", async () => {
    loadPublishedCatalog.mockResolvedValue([{ sessions: [{ free: 1 }] }]);
    getSiteContent.mockResolvedValue({ content });
    render(await SiteShell({ children: null }));

    const header = within(screen.getByRole("banner"));
    expect(header.getByRole("link", { name: "Купить билет" }).getAttribute("href")).toBe("/afisha");
    expect(header.queryByRole("link", { name: "Запросить экскурсию" })).toBeNull();
  });

  it("сохраняет переход к бронированию конкретной экскурсии", async () => {
    getSiteContent.mockResolvedValue({ content });
    render(await SiteShell({ children: null, cta: { href: "#booking", label: "Купить билет" } }));

    const header = within(screen.getByRole("banner"));
    expect(header.getByRole("link", { name: "Купить билет" }).getAttribute("href")).toBe("#booking");
    expect(loadPublishedCatalog).not.toHaveBeenCalled();
  });
});

describe("пустая афиша", () => {
  it("даёт прямой путь к организатору и сохраняет телефон как альтернативу", () => {
    render(<EmptySchedule contacts={contactLinks(contactSettings)} />);
    expect(screen.getByRole("link", { name: "Запросить экскурсию" }).getAttribute("href"))
      .toBe("mailto:organizer@example.org");
    expect(screen.getByRole("link", { name: /^Позвонить/ }).getAttribute("href")).toMatch(/^tel:/);
  });

  it("показывает информацию о датах при отсутствии контактов", () => {
    render(<EmptySchedule contacts={[]} />);
    expect(screen.getByText(/Новые даты готовим/)).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
