"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveFaqAction } from "@/app/admin/(panel)/faq/actions";
import { MarkdownEditor } from "@/components/admin/MarkdownEditor";

export type FaqValues = { question: string; answer: string };
export const EMPTY_FAQ: FaqValues = { question: "", answer: "" };

export function FaqForm({ id, initial }: { id: number | null; initial: FaqValues }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const set = <K extends keyof FaqValues>(k: K, val: FaqValues[K]) => setV((p) => ({ ...p, [k]: val }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    start(async () => {
      const r = await saveFaqAction(id, v);
      if (r.ok) router.replace("/admin/faq?saved=1");
      else setErrors(r.error ? { ...r.fieldErrors, form: r.error } : r.fieldErrors);
    });
  }

  const err = (k: string) => errors[k] && <span className="form-error" role="alert">{errors[k]}</span>;

  return (
    <form className="tour-form faq-form" noValidate onSubmit={submit}>
      {errors.form && <p className="banner banner--error" role="alert">{errors.form}</p>}
      <label className="field">
        <span className="field-label">Вопрос</span>
        <input value={v.question} maxLength={300} aria-invalid={!!errors.question} onChange={(e) => set("question", e.target.value)} />
        {err("question")}
      </label>
      <MarkdownEditor label="Ответ" value={v.answer} onChange={(a) => set("answer", a)} maxLength={5000} invalid={!!errors.answer} hint="Поддерживается Markdown." />
      {err("answer")}
      <div className="btn-row">
        <button type="submit" className="btn btn-accent" disabled={pending}>
          {pending ? "Сохраняем…" : "Сохранить"}
        </button>
      </div>
    </form>
  );
}
