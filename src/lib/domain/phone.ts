export function normalizePhone(input: string): string | null {
  const d = input.replace(/\D/g, "");
  let national: string;
  if (d.length === 11 && (d[0] === "7" || d[0] === "8")) national = d.slice(1);
  else if (d.length === 10) national = d;
  else return null;
  if (national[0] !== "9" && !/^[3-8]/.test(national)) return null;
  return `+7${national}`;
}
