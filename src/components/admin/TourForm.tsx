"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveTourAction } from "@/app/admin/(panel)/tours/actions";
import { TicketCard, type TicketSession } from "@/components/site/TicketCard";
import { ImageDrop } from "@/components/admin/ImageDrop";
import { MarkdownEditor } from "@/components/admin/MarkdownEditor";
import { SessionsEditor, type SessionRow } from "@/components/admin/SessionsEditor";
import { parseMoscowLocal } from "@/lib/domain/moscow-time";
import { freeSeats } from "@/lib/domain/seats";


export type TourValues = {
  title: string; subtitle: string; route: string; description: string; note: string;
  durationLabel: string; ageLabel: string; priceChild: string; priceAdult: string;
  featured: boolean; coverUrl: string | null;
};

export const EMPTY_TOUR: TourValues = {
  title: "", subtitle: "", route: "", description: "", note: "", durationLabel: "", ageLabel: "",
  priceChild: "", priceAdult: "", featured: false, coverUrl: null,
};

const toInt = (s: string) => (s.trim() === "" || Number.isNaN(Number(s)) ? 0 : Math.max(0, Math.floor(Number(s))));

/** Сеансы превью: будущие и не скрытые, свободно = лимит − занято (как в публичном каталоге). */
function previewSessions(rows: SessionRow[], now: number): TicketSession[] {
  const out: TicketSession[] = [];
  rows.forEach((r, i) => {
    if (r.hidden || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(r.startsAt)) return;
    const d = parseMoscowLocal(r.startsAt);
    if (Number.isNaN(d.getTime()) || d.getTime() <= now) return;
    out.push({ id: r.id ?? -(i + 1), startsAt: d, free: freeSeats(toInt(r.capacity), r.taken) });
  });
  return out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

export function TourForm({
  id, initial, initialSessions, number,
}: { id: number | null; initial: TourValues; initialSessions: SessionRow[]; number: number }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [rows, setRows] = useState(initialSessions);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const [now] = useState(() => Date.now());
  const set = <K extends keyof TourValues>(k: K, val: TourValues[K]) => setV((p) => ({ ...p, [k]: val }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    start(async () => {
      const r = await saveTourAction(id, { ...v, priceChild: v.priceChild, priceAdult: v.priceAdult });
      if (r.ok) {
        router.replace(`/admin/tours/${r.id}?saved=1`);
        router.refresh();
      } else setErrors(r.fieldErrors);
    });
  }

  const text = (k: "title" | "subtitle" | "route" | "durationLabel" | "ageLabel", label: string, extra?: { max?: number; placeholder?: string }) => (
    <label className="field">
      <span className="field-label">{label}</span>
      <input value={v[k]} maxLength={extra?.max} placeholder={extra?.placeholder} aria-invalid={!!errors[k]} onChange={(e) => set(k, e.target.value)} />
      {errors[k] && <span className="form-error" role="alert">{errors[k]}</span>}
    </label>
  );
  const area = (k: "note", label: string, rows: number, hint?: string) => (
    <label className="field">
      <span className="field-label">{label}</span>
      <textarea rows={rows} value={v[k]} aria-invalid={!!errors[k]} onChange={(e) => set(k, e.target.value)} />
      {hint && <span className="muted hint">{hint}</span>}
      {errors[k] && <span className="form-error" role="alert">{errors[k]}</span>}
    </label>
  );
  const money = (k: "priceChild" | "priceAdult", label: string) => (
    <label className="field">
      <span className="field-label">{label}</span>
      <input type="number" min={0} inputMode="numeric" value={v[k]} aria-invalid={!!errors[k]} onChange={(e) => set(k, e.target.value)} />
      {errors[k] && <span className="form-error" role="alert">{errors[k]}</span>}
    </label>
  );

  const preview = (
    <aside className="tour-preview" aria-label="Предпросмотр карточки">
      <p className="field-label">Так карточка выглядит на сайте</p>
      <div className="tp">
        <TicketCard
          tour={{
            title: v.title || "Название экскурсии", subtitle: v.subtitle, route: v.route, description: v.description, note: v.note,
            durationLabel: v.durationLabel, ageLabel: v.ageLabel, coverUrl: v.coverUrl,
            priceChild: toInt(v.priceChild), priceAdult: toInt(v.priceAdult), featured: v.featured,
          }}
          sessions={previewSessions(rows, now)}
          number={number}
          defaultOpen
        />
      </div>
    </aside>
  );

  return (
    <div className="tour-edit">
      <div className="tour-main">
        <form onSubmit={submit} className="tour-form" noValidate>
          {errors.form && <p className="banner banner--error" role="alert">{errors.form}</p>}
          {text("title", "Название", { max: 120 })}
          {text("subtitle", "Подзаголовок", { max: 120 })}
          {text("route", "Маршрут", { max: 300 })}
          <MarkdownEditor label="Описание" value={v.description} onChange={(d) => set("description", d)} maxLength={5000} invalid={!!errors.description} hint="Поддерживается Markdown: **жирный**, списки через «- »." />
          {errors.description && <p className="form-error" role="alert">{errors.description}</p>}
          {area("note", "Примечание", 2)}
          <div className="tour-grid">
            {text("durationLabel", "Длительность", { max: 40, placeholder: "2 часа" })}
            {text("ageLabel", "Возраст", { max: 10, placeholder: "6+" })}
            {money("priceChild", "Цена детская, ₽")}
            {money("priceAdult", "Цена взрослая, ₽")}
          </div>
          <ImageDrop value={v.coverUrl} onChange={(u) => set("coverUrl", u)} />
          {errors.coverUrl && <p className="form-error" role="alert">{errors.coverUrl}</p>}
          <label className="check">
            <input type="checkbox" checked={v.featured} onChange={(e) => set("featured", e.target.checked)} />
            Главная экскурсия (крупная карточка)
          </label>
          <div className="btn-row">
            <button type="submit" className="btn btn-accent" disabled={pending}>
              {pending ? "Сохраняем…" : id === null ? "Создать экскурсию" : "Сохранить"}
            </button>
          </div>
        </form>

        {id === null ? (
          <p className="empty">Сеансы можно добавить после создания экскурсии.</p>
        ) : (
          <SessionsEditor tourId={id} rows={rows} onChange={setRows} />
        )}
      </div>
      {preview}
    </div>
  );
}
