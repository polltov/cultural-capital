export function formatOrderNumber(n: number): string {
  return `КС-${String(n).padStart(4, "0")}`;
}
