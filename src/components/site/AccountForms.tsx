"use client";

import { useActionState } from "react";
import { loginWithLinkAction, requestLinkAction, type LinkState } from "@/app/(site)/account/actions";

export function RequestLinkForm() {
  const [state, action, pending] = useActionState<LinkState, FormData>(requestLinkAction, null);
  if (state?.sent) {
    return (
      <p className="acc-note" role="status">
        Если на <b>{state.email}</b> оформлялись заказы, мы отправили туда ссылку для входа. Она действует 30 минут. Письма нет —
        проверьте папку «Спам» и адрес, который вы указывали при покупке.
      </p>
    );
  }
  return (
    <form action={action} className="acc-form" noValidate>
      <label className="acc-label" htmlFor="acc-email">Email, на который вы покупали билеты</label>
      <input id="acc-email" className="acc-input" name="email" type="email" inputMode="email" autoComplete="email" required defaultValue={state?.email ?? ""} aria-invalid={!!state?.error} />
      {/* Honeypot: скрыто от людей */}
      <div className="bk-hp" aria-hidden="true">
        <input type="text" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      {state?.error && <p className="acc-error" role="alert">{state.error}</p>}
      <button type="submit" className="btn btn--primary" disabled={pending}>{pending ? "Отправляем…" : "Прислать ссылку для входа"}</button>
    </form>
  );
}

export function LinkLoginForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<{ error: string } | null, FormData>(() => loginWithLinkAction(token), null);
  return (
    <form action={action} className="acc-form">
      {state?.error && <p className="acc-error" role="alert">{state.error}</p>}
      <button type="submit" className="btn btn--primary" disabled={pending}>{pending ? "Входим…" : "Войти в личный кабинет"}</button>
    </form>
  );
}
