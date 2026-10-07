"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const POLL_MS = 3000;
const MAX_REFRESHES = 20; // 20 × 3 с = 60 с

/**
 * «Ждёт оплаты»: раз в 3 с просит сервер перерисовать страницу (при каждом обновлении он сверяется с ЮKassa)
 * и через минуту сдаётся. Билет появляется, как только заказ становится оплаченным: этот компонент тогда уходит из дерева.
 */
export function AwaitPayment() {
  const router = useRouter();
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    let refreshes = 0;
    const timer = setInterval(() => {
      // Тик после последнего обновления: у того было 3 с, чтобы принести билет, — только теперь сдаёмся.
      if (refreshes === MAX_REFRESHES) {
        clearInterval(timer);
        setGaveUp(true);
        return;
      }
      refreshes += 1;
      router.refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [router]);

  return (
    <div className="order-state" aria-live="polite">
      {gaveUp ? (
        <h1 className="order-h1">Оплата ещё обрабатывается — билет придёт на почту, как только банк подтвердит платёж</h1>
      ) : (
        <>
          <span className="order-spinner" aria-hidden="true" />
          <h1 className="order-h1">Проверяем оплату…</h1>
        </>
      )}
    </div>
  );
}
