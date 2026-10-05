"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveNewsAction, setNewsPublishedAction } from "@/app/admin/(panel)/news/actions";
import { ImageDrop } from "@/components/admin/ImageDrop";
import { MarkdownEditor } from "@/components/admin/MarkdownEditor";
import { slugify } from "@/lib/domain/slug";

export type NewsValues = { title: string; slug: string; excerpt: string; body: string; coverUrl: string | null };
export const EMPTY_NEWS: NewsValues = { title: "", slug: "", excerpt: "", body: "", coverUrl: null };

export function NewsForm({ id, initial, published }: { id: number | null; initial: NewsValues; published: boolean }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  // Адрес следует за заголовком, пока его не правили руками (у сохранённой новости адрес не трогаем).
  const [slugTouched, setSlugTouched] = useState(id !== null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const set = <K extends keyof NewsValues>(k: K, val: NewsValues[K]) => setV((p) => ({ ...p, [k]: val }));

  function submit(publish: boolean | null) {
    setErrors({});
    start(async () => {
      // Автозаполненный адрес не фиксируем: при совпадении сервер сам добавит «-2».
      const r = await saveNewsAction(id, { ...v, slug: id === null && !slugTouched ? "" : v.slug });
      if (!r.ok) return setErrors(r.fieldErrors);
      if (publish !== null && publish !== (id !== null && published)) {
        const p = await setNewsPublishedAction(r.id, publish);
        if (!p.ok) return setErrors({ form: p.error });
      }
      router.replace(`/admin/news/${r.id}?saved=1`);
      router.refresh();
    });
  }

  const err = (k: string) => errors[k] && <span className="form-error" role="alert">{errors[k]}</span>;

  return (
    <form
      className="tour-form news-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit(null);
      }}
    >
      {errors.form && <p className="banner banner--error" role="alert">{errors.form}</p>}
      <label className="field">
        <span className="field-label">Заголовок</span>
        <input
          value={v.title}
          maxLength={160}
          aria-invalid={!!errors.title}
          onChange={(e) => {
            const title = e.target.value;
            setV((p) => ({ ...p, title, slug: slugTouched ? p.slug : slugify(title) }));
          }}
        />
        {err("title")}
      </label>
      <label className="field">
        <span className="field-label">Адрес страницы</span>
        <input
          value={v.slug}
          maxLength={120}
          aria-invalid={!!errors.slug}
          placeholder="заполнится по заголовку"
          onChange={(e) => {
            setSlugTouched(true);
            set("slug", e.target.value);
          }}
        />
        <span className="muted hint">/news/{slugify(v.slug) || "…"} — латиница, цифры и дефис</span>
        {err("slug")}
      </label>
      <label className="field">
        <span className="field-label">Анонс</span>
        <textarea rows={3} value={v.excerpt} maxLength={300} aria-invalid={!!errors.excerpt} onChange={(e) => set("excerpt", e.target.value)} />
        <span className="muted hint">{v.excerpt.length} / 300 — показывается в карточке и в превью ссылки</span>
        {err("excerpt")}
      </label>
      <ImageDrop folder="news" label="Обложка" value={v.coverUrl} onChange={(u) => set("coverUrl", u)} />
      {errors.coverUrl && <p className="form-error" role="alert">{errors.coverUrl}</p>}
      <MarkdownEditor label="Текст" value={v.body} onChange={(b) => set("body", b)} maxLength={50000} invalid={!!errors.body} hint="Поддерживается Markdown." />
      {err("body")}
      <div className="btn-row">
        <button type="submit" className="btn btn-accent" disabled={pending}>
          {pending ? "Сохраняем…" : "Сохранить"}
        </button>
        {id === null ? (
          <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => submit(true)}>
            Сохранить и опубликовать
          </button>
        ) : (
          <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => submit(!published)}>
            {published ? "В черновики" : "Опубликовать"}
          </button>
        )}
      </div>
    </form>
  );
}
