"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { reorderAction, setPublishedAction } from "@/app/admin/(panel)/tours/actions";

export type TourListItem = { id: number; title: string; coverUrl: string | null; published: boolean; next: string | null };

function Item({ t, onToggle, busy }: { t: TourListItem; onToggle: () => void; busy: boolean }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: t.id });
  return (
    <li
      ref={setNodeRef}
      className={`trow${isDragging ? " trow--drag" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button ref={setActivatorNodeRef} type="button" className="handle" aria-label={`Перетащить: ${t.title}`} {...attributes} {...listeners}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
          <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
        </svg>
      </button>
      <span className="thumb" style={t.coverUrl ? { backgroundImage: `url("${t.coverUrl}")` } : undefined} aria-hidden="true" />
      <Link href={`/admin/tours/${t.id}`} className="trow-main">
        <span className="trow-title">{t.title}</span>
        <span className="muted trow-next">{t.next ? `Ближайший сеанс: ${t.next}` : "Нет предстоящих сеансов"}</span>
      </Link>
      <button type="button" role="switch" aria-checked={t.published} className={`switch${t.published ? " switch--on" : ""}`} disabled={busy} onClick={onToggle}>
        <span className="switch-knob" aria-hidden="true" />
        <span className="switch-label">{t.published ? "Опубликована" : "Скрыта"}</span>
      </button>
    </li>
  );
}

export function TourList({ initial }: { initial: TourListItem[] }) {
  const [items, setItems] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const prev = items;
    const next = arrayMove(prev, prev.findIndex((x) => x.id === e.active.id), prev.findIndex((x) => x.id === e.over!.id));
    setItems(next);
    setError(null);
    start(async () => {
      const r = await reorderAction(next.map((x) => x.id));
      if (!r.ok) {
        setItems(prev);
        setError(r.error);
      }
    });
  }

  function toggle(t: TourListItem) {
    const published = !t.published;
    setError(null);
    setItems((xs) => xs.map((x) => (x.id === t.id ? { ...x, published } : x)));
    start(async () => {
      const r = await setPublishedAction(t.id, published);
      if (!r.ok) {
        setItems((xs) => xs.map((x) => (x.id === t.id ? { ...x, published: t.published } : x)));
        setError(r.error);
      }
    });
  }

  return (
    <>
      {error && <div className="toast toast--error" role="alert">{error}</div>}
      {items.length === 0 ? (
        <p className="empty">Экскурсий пока нет.</p>
      ) : (
        <DndContext id="tour-list-dnd" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={items.map((x) => x.id)} strategy={verticalListSortingStrategy}>
            <ul className="trows">
              {items.map((t) => (
                <Item key={t.id} t={t} busy={pending} onToggle={() => toggle(t)} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </>
  );
}
