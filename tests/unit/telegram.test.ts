import { describe, it, expect } from "vitest";
import { buildOrderMessage } from "@/server/telegram";
import { formatRub } from "@/lib/domain/pricing";

const base = {
  number: "КС-0042", tourTitle: "Египетский зал Эрмитажа", startsAt: new Date("2026-10-04T08:00:00Z"),
  children: 2, adults: 1, total: 3270, name: "Анна", phone: "+79991234567", comment: null as string | null,
  adminUrl: "https://x.test/admin/orders/42",
};

describe("buildOrderMessage", () => {
  it("contains key facts", () => {
    const m = buildOrderMessage(base);
    for (const s of ["КС-0042", "Египетский зал Эрмитажа", "вс, 4 октября 2026, 11:00", "2 детских + 1 взрослый", formatRub(3270), "+79991234567", "https://x.test/admin/orders/42"]) {
      expect(m).toContain(s);
    }
  });
  it("composition forms", () => {
    expect(buildOrderMessage({ ...base, children: 1, adults: 0 })).toContain("1 детский");
    expect(buildOrderMessage({ ...base, children: 0, adults: 3 })).toContain("3 взрослых");
  });
  it("escapes html", () => {
    const m = buildOrderMessage({ ...base, name: "<script>x</script>", comment: "a & b" });
    expect(m).not.toContain("<script>");
    expect(m).toContain("&lt;script&gt;");
    expect(m).toContain("a &amp; b");
  });
});
