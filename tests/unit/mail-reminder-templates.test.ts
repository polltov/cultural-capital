import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { abandonedEmail, reminderEmail, type TicketData } from "@/server/mail/templates";
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

const savedOperator = { ...operator };
beforeEach(() => Object.assign(operator, { phone: "", email: "" }));
afterEach(() => Object.assign(operator, savedOperator));

describe("reminderEmail", () => {
  it("тема с экскурсией и временем; в письме место встречи, что взять, состав и ссылка на билет", () => {
    const m = reminderEmail(t);
    expect(m.subject).toBe("Напоминание: «Египетский зал Эрмитажа» — вс, 4 октября 2026, 11:00");
    for (const s of ["Главный вход, у кассы", "Удобная обувь", "2 детских + 1 взрослый", "КС-0057", t.url, "Анна"]) {
      expect(m.html).toContain(s);
      expect(m.text).toContain(s);
    }
    expect(m.text).not.toMatch(/<[a-z/]/i);
  });

  it("без контактов нет фразы «напишите или позвоните»; с контактами — есть", () => {
    expect(reminderEmail(t).text).not.toContain("напишите или позвоните");
    Object.assign(operator, { phone: "+7 999 123-45-67" });
    const m = reminderEmail(t);
    expect(m.text).toContain("напишите или позвоните");
    expect(m.text).toContain("+7 999 123-45-67");
  });

  it("пустые место встречи и «что взять» не выводятся", () => {
    const m = reminderEmail({ ...t, meetingPoint: " ", whatToBring: "" });
    expect(m.text).not.toContain("Место встречи");
    expect(m.text).not.toContain("Что взять");
  });

  it("экранирует подставляемые строки", () => {
    const m = reminderEmail({ ...t, name: "<b>Анна</b>", tourTitle: "A & B" });
    expect(m.html).toContain("&lt;b&gt;Анна&lt;/b&gt;");
    expect(m.html).toContain("A &amp; B");
    expect(m.html).not.toContain("<b>Анна</b>");
  });
});

describe("abandonedEmail", () => {
  const buy = "https://x.test/tours/ermitazh#booking";

  it("тема, дата, состав и ссылка на покупку; без ссылки на страницу заказа и без суммы", () => {
    const m = abandonedEmail(t, buy);
    expect(m.subject).toBe("Вы не завершили покупку — «Египетский зал Эрмитажа»");
    for (const s of ["вс, 4 октября 2026, 11:00", "2 детских + 1 взрослый", "Места на эту дату пока есть"]) {
      expect(m.html).toContain(s);
      expect(m.text).toContain(s);
    }
    expect(m.html).toContain(buy);
    expect(m.text).toContain(buy);
    expect(m.text).not.toContain(t.url);
    expect(m.text).not.toContain("КС-0057");
    expect(m.text).not.toMatch(/<[a-z/]/i);
  });
});

describe("QR-код в письмах", () => {
  const qr = { ...t, qrImageUrl: "https://x.test/order/abc_DEF-123/qr" };

  it("билет, перенос и напоминание показывают картинку QR-кода, если она есть", async () => {
    const { ticketEmail } = await import("@/server/mail/templates");
    for (const m of [ticketEmail(qr, "paid"), ticketEmail(qr, "moved"), reminderEmail(qr)]) {
      expect(m.html).toContain('<img src="https://x.test/order/abc_DEF-123/qr"');
      expect(m.html).toContain("Покажите QR-код гиду");
    }
  });

  it("без ссылки на картинку блока QR нет", () => {
    expect(reminderEmail(t).html).not.toContain("<img");
  });
});

describe("ticketsCancelledEmail", () => {
  it("какие билеты отменены, сколько возвращаем, что осталось, ссылка на билет", async () => {
    const { ticketsCancelledEmail } = await import("@/server/mail/templates");
    const m = ticketsCancelledEmail({ ...t, children: 1, adults: 1 }, { children: 1, adults: 0 }, 1000);
    expect(m.subject).toBe("Часть билетов по заказу КС-0057 отменена");
    for (const s of ["отменены билеты: 1 детский.", "Возвращаем вам 1", "Осталось", "1 детский + 1 взрослый", t.url]) {
      expect(m.text).toContain(s);
    }
    expect(m.text).not.toMatch(/<[a-z/]/i);
  });

  it("без возврата — без строк про деньги", async () => {
    const { ticketsCancelledEmail } = await import("@/server/mail/templates");
    const m = ticketsCancelledEmail({ ...t, children: 2, adults: 0 }, { children: 0, adults: 1 }, 0);
    expect(m.text).not.toContain("Возвращаем");
    expect(m.text).not.toContain("Деньги вернутся");
  });
});
