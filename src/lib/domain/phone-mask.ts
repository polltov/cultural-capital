/** Лёгкая маска ввода: `+7 (___) ___-__-__`. Возвращает отформатированную строку для частично введённых цифр. */
export function maskPhone(input: string): string {
  let d = input.replace(/\D/g, "");
  if (d[0] === "7" || d[0] === "8") d = d.slice(1);
  d = d.slice(0, 10);
  if (d.length === 0) return "";
  let out = "+7 (" + d.slice(0, 3);
  if (d.length >= 3) out += ")";
  if (d.length > 3) out += " " + d.slice(3, 6);
  if (d.length > 6) out += "-" + d.slice(6, 8);
  if (d.length > 8) out += "-" + d.slice(8, 10);
  return out;
}
