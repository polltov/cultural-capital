import { afterEach, describe, expect, it } from "vitest";
import { cancelledEmail, sorryEmail, ticketEmail, type TicketData } from "@/server/mail/templates";
import { formatRub } from "@/lib/domain/pricing";
import { operator } from "@/lib/legal";

const t: TicketData = {
  orderId: 57,
  number: "КС-0057",
  tourTitle: "Египетский зал Эрмитажа",
  startsAt: new Date("2026-10-04T08:00:00Z"),
  meetingPoint: "Главный вход, у кассы",
  whatToBring: "Удобная обувь\nБутылка воды",
  children: 2,
  adults: 1,
  total: 3270,
  name: "Анна",
  email: "anna@example.com",
  url: "https://x.test/order/abc_DEF-123",
};

describe("ticketEmail", () => {
  it("paid: тема и содержимое", () => {
    const m = ticketEmail(t, "paid");
    expect(m.subject).toBe("Ваш билет КС-0057 — Египетский зал Эрмитажа");
    for (const s of [
      t.url, "Кассовый чек придёт отдельным письмом от ЮKassa", "Главный вход, у кассы", "2 детских + 1 взрослый",
      formatRub(3270), "КС-0057", "Египетский зал Эрмитажа", "вс, 4 октября 2026, 11:00", "Анна", "Что взять с собой",
    ]) {
      expect(m.html).toContain(s);
    }
  });

  it("текстовая версия содержит те же факты без разметки", () => {
    const m = ticketEmail(t, "paid");
    for (const s of [
      t.url, "Кассовый чек придёт отдельным письмом от ЮKassa", "Главный вход, у кассы", "2 детских + 1 взрослый",
      formatRub(3270), "КС-0057", "вс, 4 октября 2026, 11:00", "Удобная обувь", "Бутылка воды",
    ]) {
      expect(m.text).toContain(s);
    }
    expect(m.text).not.toMatch(/<[a-z/]/i);
  });

  it("moved: другая тема, без строки про кассовый чек", () => {
    const m = ticketEmail(t, "moved");
    expect(m.subject).toBe("Билет КС-0057 перенесён");
    expect(m.html).toContain(t.url);
    expect(m.html).toContain("вс, 4 октября 2026, 11:00");
    expect(m.html).not.toContain("Кассовый чек");
    expect(m.text).not.toContain("Кассовый чек");
  });

  it("экранирует подставляемые строки", () => {
    const m = ticketEmail(
      { ...t, name: "<b>x</b>", tourTitle: "A & B", meetingPoint: "<script>alert(1)</script>", whatToBring: "\"кепка\" <i>и</i>" },
      "paid",
    );
    expect(m.html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(m.html).toContain("A &amp; B");
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.html).toContain("&quot;кепка&quot; &lt;i&gt;и&lt;/i&gt;");
    expect(m.html).not.toContain("<b>x</b>");
    expect(m.html).not.toContain("<script>");
    // В теме и тексте HTML-экранирование не нужно: там строки остаются как есть.
    expect(m.subject).toBe("Ваш билет КС-0057 — A & B");
    expect(m.text).toContain("<b>x</b>");
  });

  it("пустое «что взять» — блока нет", () => {
    for (const empty of ["", "  \n "]) {
      const m = ticketEmail({ ...t, whatToBring: empty }, "paid");
      expect(m.html).not.toContain("Что взять с собой");
      expect(m.text).not.toContain("Что взять с собой");
    }
  });

  it("пустое место встречи — строки нет", () => {
    const m = ticketEmail({ ...t, meetingPoint: "" }, "paid");
    expect(m.html).not.toContain("Место встречи");
    expect(m.text).not.toContain("Место встречи");
  });

  it("многострочное «что взять» сохраняет переносы", () => {
    expect(ticketEmail(t, "paid").html).toContain("Удобная обувь<br>Бутылка воды");
  });

  it("условия отмены присутствуют", () => {
    const m = ticketEmail(t, "paid");
    expect(m.html).toContain("за 24 часа");
    expect(m.text).toContain("за 24 часа");
  });

  describe("контакты", () => {
    const saved = { ...operator };
    afterEach(() => Object.assign(operator, saved));

    it("показываются, когда заполнены (и экранируются)", () => {
      Object.assign(operator, { phone: "+7 999 123-45-67", email: "hi@x.test" });
      const m = ticketEmail(t, "paid");
      expect(m.html).toContain("+7 999 123-45-67");
      expect(m.html).toContain("hi@x.test");
      expect(m.text).toContain("hi@x.test");
    });

    it("не показываются, когда пусты", () => {
      expect(ticketEmail(t, "paid").html).not.toContain("Контакты");
    });
  });
});

describe("cancelledEmail", () => {
  it("с возвратом: сумма и срок", () => {
    const m = cancelledEmail(t, 1635);
    expect(m.subject).toBe("Заказ КС-0057 отменён");
    expect(m.html).toContain(formatRub(1635));
    expect(m.text).toContain(formatRub(1635));
    expect(m.html).toContain("в течение нескольких дней");
    expect(m.html).not.toContain("без возврата");
  });

  it("без возврата", () => {
    const m = cancelledEmail(t, 0);
    expect(m.html).toContain("Заказ отменён без возврата");
    expect(m.text).toContain("Заказ отменён без возврата");
    expect(m.html).not.toContain("в течение нескольких дней");
  });

  it("экранирует имя и название", () => {
    const m = cancelledEmail({ ...t, name: "<b>x</b>", tourTitle: "<i>T</i>" }, 100);
    expect(m.html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(m.html).toContain("&lt;i&gt;T&lt;/i&gt;");
    expect(m.html).not.toContain("<b>x</b>");
  });
});

describe("sorryEmail", () => {
  it("тема, полный возврат и ссылка на каталог", () => {
    const m = sorryEmail(t);
    expect(m.subject).toBe("Извините, места закончились — заказ КС-0057");
    expect(m.html).toContain(formatRub(3270));
    expect(m.html).toContain("https://x.test/#catalog");
    expect(m.text).toContain("https://x.test/#catalog");
    expect(m.html).toContain("Египетский зал Эрмитажа");
  });

  it("экранирует имя", () => {
    const m = sorryEmail({ ...t, name: "<b>x</b>" });
    expect(m.html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(m.html).not.toContain("<b>x</b>");
  });
});
