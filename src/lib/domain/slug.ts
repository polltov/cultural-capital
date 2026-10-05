const MAP: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

export function slugify(title: string): string {
  const t = [...title.toLowerCase()].map((c) => MAP[c] ?? c).join("");
  return t.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function uniqueSlug(base: string, exists: (s: string) => Promise<boolean>): Promise<string> {
  if (!(await exists(base))) return base;
  for (let i = 2; ; i++) {
    const c = `${base}-${i}`;
    if (!(await exists(c))) return c;
  }
}
