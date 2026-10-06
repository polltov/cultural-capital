"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { deleteFaqAction, reorderFaqAction, setFaqPublishedAction } from "@/app/admin/(panel)/faq/actions";

export type FaqListItem = { id: number; question: string; published: boolean };

function Item({
  q, busy, confirming, onToggle, onAskDelete, onCancelDelete, onDelete,
}: {
  q: FaqListItem; busy: boolean; confirming: boolean;
  onToggle: () => void; onAskDelete: () => void; onCancelDelete: () => void; onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: q.id });
  return (
    <li
      ref={setNodeRef}
      className={`frow${isDragging ? " frow--drag" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button ref={setActivatorNodeRef} type="button" className="handle" aria-label={`Перетащить: ${q.question}`} {...attributes} {...listeners}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
          <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
        </svg>
      </button>
      <div className="frow-main">
        <span className="frow-q" title={q.question}>{q.question}</span>
        {!q.published && <span className="pill">скрыт</span>}
      </div>
      <div className="frow-controls">
        <button type="button" role="switch" aria-checked={q.published} className={`switch${q.published ? " switch--on" : ""}`} disabled={busy} onClick={onToggle}>
          <span className="switch-knob" aria-hidden="true" />
          <span className="switch-label">На сайте</span>
        </button>
        <Link href={`/admin/faq/${q.id}`} className="btn btn-ghost">Изменить</Link>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={onAskDelete}>Удалить</button>
      </div>
      {confirming && (
        <div className="confirm-row frow-confirm" role="alertdialog" aria-label="Подтверждение удаления">
          <span>Удалить вопрос? Это нельзя отменить.</span>
          <button type="button" className="btn btn-danger" disabled={busy} onClick={onDelete}>Да, удалить</button>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={onCancelDelete}>Отмена</button>
        </div>
      )}
    </li>
  );
}

export function FaqList({ initial }: { initial: FaqListItem[] }) {
  const [items, setItems] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const prev = items;
    const next = arrayMove(prev, prev.findIndex((x) => x.id === e.active.id), prev.findIndex((x) => x.id === e.over!.id));
    setItems(next);
    setError(null);
    start(async () => {
      const r = await reorderFaqAction(next.map((x) => x.id));
      if (!r.ok) {
        setItems(prev);
        setError(r.error);
      }
    });
  }

  function toggle(q: FaqListItem) {
    const published = !q.published;
    setError(null);
    setItems((xs) => xs.map((x) => (x.id === q.id ? { ...x, published } : x)));
    start(async () => {
      const r = await setFaqPublishedAction(q.id, published);
      if (!r.ok) {
        setItems((xs) => xs.map((x) => (x.id === q.id ? { ...x, published: q.published } : x)));
        setError(r.error);
      }
    });
  }

  function remove(q: FaqListItem) {
    setError(null);
    start(async () => {
      const r = await deleteFaqAction(q.id);
      if (r.ok) setItems((xs) => xs.filter((x) => x.id !== q.id));
      else setError(r.error);
      setConfirmId(null);
    });
  }

  return (
    <>
      {error && <div className="toast toast--error" role="alert">{error}</div>}
      {items.length === 0 ? (
        <div className="empty faq-empty">
          <p>Вопросов пока нет</p>
          <Link href="/admin/faq/new" className="btn btn-accent">Добавить вопрос</Link>
        </div>
      ) : (
        <DndContext id="faq-list-dnd" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={items.map((x) => x.id)} strategy={verticalListSortingStrategy}>
            <ul className="frows">
              {items.map((q) => (
                <Item
                  key={q.id}
                  q={q}
                  busy={pending}
                  confirming={confirmId === q.id}
                  onToggle={() => toggle(q)}
                  onAskDelete={() => setConfirmId(q.id)}
                  onCancelDelete={() => setConfirmId(null)}
                  onDelete={() => remove(q)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </>
  );
}
