export type Edit = { text: string; start: number; end: number };

function wrap(text: string, start: number, end: number, before: string, after: string, placeholder: string): Edit {
  const sel = text.slice(start, end) || placeholder;
  const out = text.slice(0, start) + before + sel + after + text.slice(end);
  return { text: out, start: start + before.length, end: start + before.length + sel.length };
}

export const applyBold = (t: string, s: number, e: number) => wrap(t, s, e, "**", "**", "текст");
export const applyItalic = (t: string, s: number, e: number) => wrap(t, s, e, "*", "*", "текст");

/** Ссылка: выделенный текст становится подписью, выделяется адрес для замены. */
export function applyLink(text: string, start: number, end: number): Edit {
  const label = text.slice(start, end) || "текст";
  const url = "https://";
  const out = text.slice(0, start) + `[${label}](${url})` + text.slice(end);
  const urlStart = start + label.length + 3;
  return { text: out, start: urlStart, end: urlStart + url.length };
}

/** Строки, затронутые выделением, получают префикс «- » (уже помеченные не трогаем). */
export function applyList(text: string, start: number, end: number): Edit {
  const from = text.lastIndexOf("\n", start - 1) + 1;
  const nl = text.indexOf("\n", end);
  const to = nl === -1 ? text.length : nl;
  const block = text
    .slice(from, to)
    .split("\n")
    .map((l) => (/^\s*[-*] /.test(l) ? l : `- ${l}`))
    .join("\n");
  return { text: text.slice(0, from) + block + text.slice(to), start: from, end: from + block.length };
}
