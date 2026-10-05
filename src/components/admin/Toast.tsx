"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Показывает «Сохранено», когда в адресе есть ?saved=1, и убирает параметр из URL. */
export function Toast({ message = "Сохранено" }: { message?: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const saved = params.get("saved") === "1";
  const [visible, setVisible] = useState(false);
  // Обновление состояния во время рендера (а не в эффекте) — рекомендуемый React-паттерн.
  if (saved && !visible) setVisible(true);

  useEffect(() => {
    if (!saved) return;
    const rest = new URLSearchParams(params);
    rest.delete("saved");
    const qs = rest.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [saved, params, pathname, router]);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(t);
  }, [visible]);

  if (!visible) return null;
  return (
    <div className="toast" role="status" aria-live="polite">
      {message}
    </div>
  );
}
