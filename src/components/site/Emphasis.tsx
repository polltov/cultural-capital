/** Звёздочки в редакторе выделяют фразу. Остальной текст React выводит без HTML. */
export function Emphasis({ text, nowrapTail = false }: { text: string; nowrapTail?: boolean }) {
  const match = /^([^*]*)\*([^*]+)\*([^*]*)$/.exec(text);
  if (!match) return <>{text}</>;
  const [, before, accent, after] = match;
  return <>{before}<em>{accent}</em>{nowrapTail ? <> <span className="nowrap">{after.trim()}</span></> : after}</>;
}
