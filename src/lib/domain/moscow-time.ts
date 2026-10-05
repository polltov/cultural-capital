const MSK = "Europe/Moscow";
const OFFSET_MS = 3 * 60 * 60 * 1000;
const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const WEEKDAY_SHORT: Record<string, string> = { Mon: "пн", Tue: "вт", Wed: "ср", Thu: "чт", Fri: "пт", Sat: "сб", Sun: "вскр" };
const WEEKDAY_LONG: Record<string, string> = { Mon: "пн", Tue: "вт", Wed: "ср", Thu: "чт", Fri: "пт", Sat: "сб", Sun: "вс" };

const fmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: MSK, year: "numeric", month: "numeric", day: "numeric",
  hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23",
});

function parts(d: Date) {
  const p: Record<string, string> = {};
  for (const x of fmt.formatToParts(d)) p[x.type] = x.value;
  return { year: p.year, month: Number(p.month), day: Number(p.day), hour: p.hour.padStart(2, "0"), minute: p.minute.padStart(2, "0"), weekday: p.weekday };
}

/** `YYYY-MM-DDTHH:mm` interpreted as Moscow time (UTC+3, no DST). */
export function parseMoscowLocal(v: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v);
  if (!m) throw new Error("Некорректная дата");
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const t = Date.UTC(y, mo - 1, d, h, mi) - OFFSET_MS;
  if (Number.isNaN(t)) throw new Error("Некорректная дата");
  return new Date(t);
}

export function toMoscowLocalInput(d: Date): string {
  const p = parts(d);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}T${p.hour}:${p.minute}`;
}

export function formatDayMonth(d: Date): string {
  const p = parts(d);
  return `${p.day} ${MONTHS_SHORT[p.month - 1]}`;
}

export function formatWeekday(d: Date): string {
  return WEEKDAY_SHORT[parts(d).weekday];
}

export function formatTime(d: Date): string {
  const p = parts(d);
  return `${p.hour}:${p.minute}`;
}

export function formatSessionLong(d: Date): string {
  const p = parts(d);
  return `${WEEKDAY_LONG[p.weekday]}, ${p.day} ${MONTHS_GEN[p.month - 1]} ${p.year}, ${p.hour}:${p.minute}`;
}

/** «4 октября 2026» (московское время). */
export function formatDateLong(d: Date): string {
  const p = parts(d);
  return `${p.day} ${MONTHS_GEN[p.month - 1]} ${p.year}`;
}
