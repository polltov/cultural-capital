import { describe, it, expect } from "vitest";
import { slugify, uniqueSlug } from "@/lib/domain/slug";

describe("slug", () => {
  it("slugify", () => {
    expect(slugify("Ёлка в Эрмитаже!")).toBe("yolka-v-ermitazhe");
    expect(slugify("  Щука  и  Жук ")).toBe("shchuka-i-zhuk");
    expect(slugify("Hello, World 2")).toBe("hello-world-2");
  });
  it("uniqueSlug", async () => {
    expect(await uniqueSlug("a", (s) => Promise.resolve(["a", "a-2"].includes(s)))).toBe("a-3");
    expect(await uniqueSlug("b", () => Promise.resolve(false))).toBe("b");
  });
});
