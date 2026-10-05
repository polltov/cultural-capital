/**
 * Лёгкая маска ввода: `+7 (___) ___-__-__`.
 * Разделители добавляются только вместе со следующей цифрой, поэтому Backspace всегда сдвигает ввод назад.
 * Ведущую 7/8 отбрасываем только как код страны/«8» из мобильного номера:
 * - ввод начинается с «+7» (в т.ч. наша же маска);
 * - цифр 11 или далее идёт «9» (89…, 79…).
 * Иначе (например 812…) цифра остаётся кодом города.
 */
export function maskPhone(input: string): string {
  let d = input.replace(/\D/g, "");
  const plus7 = /^\s*\+\s*7/.test(input);
  const lead = (s: string) => s[0] === "7" || s[0] === "8";
  if (plus7) d = d.slice(1);
  else if (lead(d) && (d.length >= 11 || d[1] === "9")) d = d.slice(1);
  if (lead(d) && d[1] === "9") d = d.slice(1); // «+7 (89…» — набрали 8 перед мобильным
  d = d.slice(0, 10);
  if (d.length === 0) return "";
  let out = "+7 (" + d.slice(0, 3);
  if (d.length > 3) out += ") " + d.slice(3, 6);
  if (d.length > 6) out += "-" + d.slice(6, 8);
  if (d.length > 8) out += "-" + d.slice(8, 10);
  return out;
}
