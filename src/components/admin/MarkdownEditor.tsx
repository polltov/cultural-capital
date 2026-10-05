"use client";

import { useRef, useState } from "react";
import { Markdown } from "@/components/Markdown";
import { applyBold, applyItalic, applyLink, applyList, type Edit } from "@/lib/markdown-edit";

const TOOLS: { label: string; title: string; run: (t: string, s: number, e: number) => Edit; className?: string }[] = [
  { label: "Ж", title: "Жирный", run: applyBold, className: "tb-b" },
  { label: "К", title: "Курсив", run: applyItalic, className: "tb-i" },
  { label: "Список", title: "Маркированный список", run: applyList },
  { label: "Ссылка", title: "Ссылка", run: applyLink },
];

/** Текст с панелью форматирования и вкладкой предпросмотра (тот же рендер, что на сайте). */
export function MarkdownEditor({
  value, onChange, label, maxLength, invalid, hint,
}: { value: string; onChange: (v: string) => void; label: string; maxLength?: number; invalid?: boolean; hint?: string }) {
  const area = useRef<HTMLTextAreaElement>(null);
  const [tab, setTab] = useState<"edit" | "preview">("edit");

  function apply(run: (t: string, s: number, e: number) => Edit) {
    const el = area.current;
    if (!el) return;
    const r = run(value, el.selectionStart, el.selectionEnd);
    onChange(r.text);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(r.start, r.end);
    });
  }

  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="editor">
        <div className="editor-bar">
          <div role="tablist" className="editor-tabs">
            {(["edit", "preview"] as const).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} className={`etab${tab === t ? " etab--on" : ""}`} onClick={() => setTab(t)}>
                {t === "edit" ? "Текст" : "Предпросмотр"}
              </button>
            ))}
          </div>
          {tab === "edit" && (
            <div className="editor-tools" role="toolbar" aria-label="Форматирование">
              {TOOLS.map((t) => (
                <button key={t.label} type="button" className={`etool ${t.className ?? ""}`} title={t.title} aria-label={t.title} onClick={() => apply(t.run)}>
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {tab === "edit" ? (
          <textarea ref={area} className="editor-area" rows={16} value={value} maxLength={maxLength} aria-invalid={invalid} onChange={(e) => onChange(e.target.value)} />
        ) : (
          <div className="editor-preview">
            {value.trim() ? <Markdown className="md">{value}</Markdown> : <p className="muted">Пока нечего показывать.</p>}
          </div>
        )}
      </div>
      {hint && <span className="muted hint">{hint}</span>}
    </div>
  );
}
