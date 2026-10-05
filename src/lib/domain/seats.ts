export const SEAT_HOLDING_STATUSES = ["confirmed", "done"] as const;

export function freeSeats(capacity: number, occupied: number): number {
  return Math.max(0, capacity - occupied);
}

export function pluralRu(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n);
  const m10 = a % 10;
  const m100 = a % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms[1];
  return forms[2];
}

export function seatsBadge(free: number): string | null {
  if (free <= 0) return "мест нет";
  if (free > 4) return null;
  return `осталось ${free} ${pluralRu(free, ["место", "места", "мест"])}`;
}
