"use client";

import { useEffect } from "react";

export default function PanelError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="panel-error" role="alert">
      <h1 className="page-title">Что-то пошло не так</h1>
      <p className="muted">Попробуйте ещё раз. Если ошибка повторяется — сообщите разработчику.</p>
      <button type="button" className="btn btn-accent" onClick={() => retry()}>
        Повторить
      </button>
    </div>
  );
}
