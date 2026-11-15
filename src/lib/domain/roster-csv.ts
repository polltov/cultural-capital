export type RosterRow = {
  id: number; number: string; name: string; phone: string; children: number; adults: number; total: number; adminNote: string | null;
  /** Когда гид отметил приход (по QR-коду или в списке); `null` — не отмечен. */
  checkedInAt: Date | null;
};
export type Roster = {
  session: { tourTitle: string; startsAt: Date; capacity: number };
  rows: RosterRow[];
  totals: { children: number; adults: number };
};

const HEADER = ["Номер", "Имя", "Телефон", "Детей", "Взрослых", "Сумма", "Заметка", "Пришли"];

/** Защита от формул Excel: значения из публичной формы не должны выполняться как формулы. */
const guard = (s: string) => (/^[=+\-@]/.test(s) ? `'${s}` : s);
const quote = (s: string) => (/[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export function rosterToCsv(roster: Roster): string {
  const lines = [HEADER.map(quote).join(";")];
  for (const r of roster.rows) {
    lines.push(
      [
        quote(r.number),
        quote(guard(r.name)),
        quote(r.phone),
        String(r.children),
        String(r.adults),
        String(r.total),
        quote(guard(r.adminNote ?? "")),
        r.checkedInAt ? "да" : "",
      ].join(";"),
    );
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}
