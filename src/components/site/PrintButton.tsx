"use client";

/** Кнопка печати билета; единственное, что в билете требует клиентского кода. Скрывается в `@media print`. */
export function PrintButton() {
  return (
    <button className="t-btn no-print" type="button" onClick={() => window.print()}>
      Распечатать
    </button>
  );
}
