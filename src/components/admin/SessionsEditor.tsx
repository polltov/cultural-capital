"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteSessionAction, saveSessionAction } from "@/app/admin/(panel)/tours/actions";

export type SessionRow = {
  key: string;
  id?: number;
  startsAt: string; // YYYY-MM-DDTHH:mm, МСК
  capacity: string;
  hidden: boolean;
  taken: number;
  orders: number;
  error?: string;
  notice?: string;
};

let seq = 0;
export const newSessionRow = (): SessionRow => ({ key: `new-${++seq}`, startsAt: "", capacity: "8", hidden: false, taken: 0, orders: 0 });

function Row({ tourId, row, onChange, onRemove }: { tourId: number; row: SessionRow; onChange: (r: SessionRow) => void; onRemove: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const set = (p: Partial<SessionRow>) => onChange({ ...row, ...p, error: undefined, notice: undefined });

  const save = () =>
    start(async () => {
      const r = await saveSessionAction({ id: row.id, tourId, startsAt: row.startsAt, capacity: row.capacity, hidden: row.hidden });
      if (r.ok) {
        onChange({ ...row, id: r.id, error: undefined, notice: "Сохранено" });
        router.refresh();
      } else onChange({ ...row, error: r.error, notice: undefined });
    });

  const remove = () => {
    if (row.id === undefined) return onRemove();
    start(async () => {
      const r = await deleteSessionAction(row.id!);
      if (r.ok) {
        onRemove();
        router.refresh();
      } else onChange({ ...row, error: r.error, notice: undefined });
    });
  };

  return (
    <li className="srow">
      <label className="field srow-when">
        <span className="field-label">Дата и время (МСК)</span>
        <input type="datetime-local" value={row.startsAt} onChange={(e) => set({ startsAt: e.target.value })} />
      </label>
      <label className="field srow-cap">
        <span className="field-label">Лимит</span>
        <input type="number" min={1} max={100} inputMode="numeric" value={row.capacity} onChange={(e) => set({ capacity: e.target.value })} />
      </label>
      <span className="srow-taken" title="Подтверждённые и проведённые заявки">
        занято {row.taken}
      </span>
      <label className="check srow-hidden">
        <input type="checkbox" checked={row.hidden} onChange={(e) => set({ hidden: e.target.checked })} />
        скрыт
      </label>
      <span className="srow-actions">
        <button type="button" className="btn btn-accent" disabled={pending} onClick={save}>
          Сохранить
        </button>
        <button type="button" className="btn btn-ghost" disabled={pending} onClick={remove}>
          Удалить
        </button>
      </span>
      {row.error && (
        <p className="form-error srow-msg" role="alert">
          {row.error}
        </p>
      )}
      {row.notice && !row.error && <p className="muted srow-msg">{row.notice}</p>}
    </li>
  );
}

export function SessionsEditor({ tourId, rows, onChange }: { tourId: number; rows: SessionRow[]; onChange: (rows: SessionRow[]) => void }) {
  return (
    <section className="panel-section sessions-editor">
      <h2 className="section-title">Сеансы</h2>
      <p className="muted section-sub">Каждый сеанс сохраняется отдельной кнопкой. Сеанс с заявками удалить нельзя — только скрыть.</p>
      {rows.length === 0 && <p className="empty">Сеансов пока нет.</p>}
      <ul className="srows">
        {rows.map((r) => (
          <Row
            key={r.key}
            tourId={tourId}
            row={r}
            onChange={(next) => onChange(rows.map((x) => (x.key === r.key ? next : x)))}
            onRemove={() => onChange(rows.filter((x) => x.key !== r.key))}
          />
        ))}
      </ul>
      <button type="button" className="btn btn-ghost" onClick={() => onChange([...rows, newSessionRow()])}>
        + Добавить сеанс
      </button>
    </section>
  );
}
