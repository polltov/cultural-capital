// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Markdown } from "@/components/Markdown";

afterEach(cleanup);

describe("Markdown", () => {
  it("renders basic markdown", () => {
    const { container } = render(<Markdown>{"**жирный**\n\n- раз\n- два"}</Markdown>);
    expect(container.querySelector("strong")?.textContent).toBe("жирный");
    expect(container.querySelectorAll("li")).toHaveLength(2);
  });

  it("does not create script elements or onerror images from raw html", () => {
    const { container } = render(<Markdown>{'<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">'}</Markdown>);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img[onerror]")).toBeNull();
    expect(container.querySelector("[onerror]")).toBeNull();
  });

  it("strips javascript: links", () => {
    const { container } = render(<Markdown>{"[x](javascript:alert(1))"}</Markdown>);
    const a = container.querySelector("a");
    expect(a?.getAttribute("href") ?? "").not.toMatch(/^javascript:/i);
  });

  it("opens external links in a new tab safely, keeps internal ones", () => {
    const { container } = render(<Markdown>{"[a](https://example.com) [b](/news)"}</Markdown>);
    const [a, b] = Array.from(container.querySelectorAll("a"));
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noopener noreferrer");
    expect(b.getAttribute("target")).toBeNull();
  });
});
