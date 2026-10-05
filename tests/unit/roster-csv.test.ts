import { describe, it, expect } from "vitest";
import { rosterToCsv, type Roster } from "@/lib/domain/roster-csv";

const mk = (rows: Roster["rows"]): Roster => ({
  session: { tourTitle: "Т", startsAt: new Date(), capacity: 8 },
  rows,
  totals: { children: 0, adults: 0 },
});
const row = (o: Partial<Roster["rows"][number]> = {}) => ({
  number: "КС-0001", name: "Анна", phone: "+79111234567", children: 1, adults: 2, total: 3000, adminNote: null, ...o,
});

describe("rosterToCsv", () => {
  it("starts with BOM, header, CRLF", () => {
    const csv = rosterToCsv(mk([row()]));
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toBe("﻿Номер;Имя;Телефон;Детей;Взрослых;Сумма;Заметка\r\nКС-0001;Анна;+79111234567;1;2;3000;\r\n");
  });
  it("quotes fields with ; \" CR LF", () => {
    const csv = rosterToCsv(mk([row({ name: 'А;Б', adminNote: 'он "сказал"\nпозвонить' })]));
    expect(csv).toContain('"А;Б"');
    expect(csv).toContain('"он ""сказал""\nпозвонить"');
  });
  it("guards formula injection in name and note, not phone", () => {
    const csv = rosterToCsv(mk([row({ name: "=1+1", adminNote: "@cmd" })]));
    expect(csv).toContain(";'=1+1;");
    expect(csv).toContain(";'@cmd\r\n");
    expect(csv).toContain(";+79111234567;");
  });
});
