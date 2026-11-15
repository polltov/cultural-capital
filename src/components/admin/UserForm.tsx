"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveUserAction } from "@/app/admin/(panel)/users/actions";

export type UserValues = { login: string; name: string; role: "admin" | "guide"; active: boolean; password: string };
export const EMPTY_USER: UserValues = { login: "", name: "", role: "guide", active: true, password: "" };

/** Новый сотрудник (`id === null`: логин и пароль обязательны) или правка (логин не меняется, пустой пароль — без смены). */
export function UserForm({ id, initial, self }: { id: number | null; initial: UserValues; self?: boolean }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const set = <K extends keyof UserValues>(k: K, val: UserValues[K]) => setV((p) => ({ ...p, [k]: val }));
  const isNew = id === null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    start(async () => {
      const r = await saveUserAction(id, isNew ? { login: v.login, name: v.name, role: v.role, password: v.password } : { name: v.name, role: v.role, active: v.active, password: v.password });
      if (r.ok) router.replace("/admin/users?saved=1");
      else setErrors(r.error ? { ...r.fieldErrors, form: r.error } : r.fieldErrors);
    });
  }

  const err = (k: string) => errors[k] && <span className="form-error" role="alert">{errors[k]}</span>;

  return (
    <form className="tour-form user-form" noValidate onSubmit={submit}>
      {errors.form && <p className="banner banner--error" role="alert">{errors.form}</p>}
      {isNew && (
        <label className="field">
          <span className="field-label">Логин</span>
          <input value={v.login} maxLength={40} autoComplete="off" autoCapitalize="none" spellCheck={false} aria-invalid={!!errors.login} onChange={(e) => set("login", e.target.value)} />
          <span className="hint muted">Латинские буквы, цифры, точка, дефис; регистр при входе не важен</span>
          {err("login")}
        </label>
      )}
      <label className="field">
        <span className="field-label">Имя</span>
        <input value={v.name} maxLength={80} aria-invalid={!!errors.name} onChange={(e) => set("name", e.target.value)} />
        {err("name")}
      </label>
      <fieldset className="field user-roles" disabled={self}>
        <legend className="field-label">Роль</legend>
        <label className="check">
          <input type="radio" name="role" checked={v.role === "admin"} onChange={() => set("role", "admin")} />
          <span><b>Администратор</b> — всё: заказы, возвраты, экскурсии, новости, сотрудники</span>
        </label>
        <label className="check">
          <input type="radio" name="role" checked={v.role === "guide"} onChange={() => set("role", "guide")} />
          <span><b>Гид</b> — ближайшие сеансы, списки участников и отметка прихода по QR-коду</span>
        </label>
        {self && <span className="hint muted">Свою роль сменить нельзя</span>}
        {err("role")}
      </fieldset>
      <label className="field">
        <span className="field-label">{isNew ? "Пароль" : "Новый пароль"}</span>
        <input type="text" value={v.password} maxLength={200} autoComplete="new-password" spellCheck={false} aria-invalid={!!errors.password} onChange={(e) => set("password", e.target.value)} />
        <span className="hint muted">{isNew ? "Не короче 10 символов. Передайте его сотруднику лично." : "Оставьте пустым, чтобы не менять. После смены сотрудника выкинет из админки на всех устройствах."}</span>
        {err("password")}
      </label>
      {!isNew && !self && (
        <label className="check">
          <input type="checkbox" checked={v.active} onChange={(e) => set("active", e.target.checked)} />
          <span>Вход разрешён (снимите галочку, чтобы отключить сотрудника)</span>
        </label>
      )}
      <div className="btn-row">
        <button type="submit" className="btn btn-accent" disabled={pending}>
          {pending ? "Сохраняем…" : isNew ? "Добавить" : "Сохранить"}
        </button>
      </div>
    </form>
  );
}
