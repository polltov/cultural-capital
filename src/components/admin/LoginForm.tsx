"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/app/admin/login/actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, null);
  return (
    <form action={action} className="login-form" noValidate>
      <label className="field">
        <span className="field-label">Логин</span>
        <input name="login" autoComplete="username" required defaultValue={state?.login ?? ""} autoFocus />
      </label>
      <label className="field">
        <span className="field-label">Пароль</span>
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {state?.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      <button type="submit" className="btn btn-accent" disabled={pending}>
        {pending ? "Входим…" : "Войти"}
      </button>
    </form>
  );
}
