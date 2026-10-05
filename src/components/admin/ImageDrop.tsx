"use client";

import { useRef, useState, useTransition } from "react";
import { uploadCoverAction } from "@/app/admin/(panel)/tours/actions";

const TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX = 8 * 1024 * 1024;

/** Загрузка обложки: перетаскивание или клик. Ошибка показывается рядом и не трогает остальную форму. */
export function ImageDrop({ value, onChange }: { value: string | null; onChange: (url: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [pending, start] = useTransition();

  function upload(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!TYPES.includes(file.type)) return setError("Подходят только изображения JPG, PNG или WebP");
    if (file.size > MAX) return setError("Файл больше 8 МБ — выберите фото поменьше");
    const fd = new FormData();
    fd.set("file", file);
    start(async () => {
      try {
        const r = await uploadCoverAction(fd);
        if (r.ok) onChange(r.url);
        else setError(r.error);
      } catch {
        setError("Не удалось загрузить фото. Попробуйте ещё раз");
      }
    });
  }

  return (
    <div className="field">
      <span className="field-label">Обложка</span>
      <div
        className={`drop${over ? " drop--over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          upload(e.dataTransfer.files[0]);
        }}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element -- превью обложки из Blob, без оптимизатора
          <img src={value} alt="Обложка экскурсии" className="drop-img" />
        ) : (
          <span className="muted">Перетащите фото сюда</span>
        )}
        <div className="btn-row">
          <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => input.current?.click()}>
            {pending ? "Загрузка…" : value ? "Заменить фото" : "Выбрать фото"}
          </button>
          {value && (
            <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => onChange(null)}>
              Убрать
            </button>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept={TYPES.join(",")}
          hidden
          data-testid="cover-input"
          onChange={(e) => {
            upload(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
