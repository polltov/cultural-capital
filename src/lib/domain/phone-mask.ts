/**
 * Лёгкая маска ввода: `+7 (___) ___-__-__`.
 * - Первая набранная «+», «7» или «8» — код страны/«8», показываем «+7 (» без национальных цифр.
 * - Значение уже в маске (начинается с «+7») — национальные цифры это всё после ведущей 7.
 * - Сырой ввод (вставка, автозаполнение): 11 цифр с 7/8 — отбрасываем первую; иначе цифры как есть.
 * Разделители добавляются только вместе со следующей цифрой, Backspace всегда сдвигает ввод назад.
 */
export function maskPhone(input: string): string {
  const all = input.replace(/\D/g, "");
  const lead = (s: string) => s[0] === "7" || s[0] === "8";
  const plus7 = /^\s*\+\s*7/.test(input);
  let d: string;
  if (plus7) {
    d = all.slice(1);
    // «+7 (» после Backspace теряет «(» → «+7 »: очищаем, иначе маска вернёт скобку и ввод застрянет.
    if (d === "") return input.includes("(") ? "+7 (" : "";
  } else if (all.length === 1 && lead(all)) {
    return "+7 (";
  } else if (all.length >= 11 && lead(all)) {
    d = all.slice(1);
  } else {
    d = all;
  }
  d = d.slice(0, 10);
  if (d.length === 0) return "";
  let out = "+7 (" + d.slice(0, 3);
  if (d.length > 3) out += ") " + d.slice(3, 6);
  if (d.length > 6) out += "-" + d.slice(6, 8);
  if (d.length > 8) out += "-" + d.slice(8, 10);
  return out;
}
