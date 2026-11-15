import { beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { adminUsers } from "@/db/schema";
import { ownerFingerprint, readSessionToken } from "@/lib/auth/session";
import { resolveViewer } from "@/lib/auth/viewer";
import { attemptLogin, LOGIN_ERROR } from "@/server/admin-auth";
import { createAdminUser, getAdminUser, listAdminUsers, updateAdminUser } from "@/server/admin-users";

beforeAll(() => {
  process.env.SESSION_SECRET = "int-test-secret-0123456789abcdef0123456789abcdef";
  process.env.ADMIN_LOGIN = "owner";
  process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync("owner-pass", 4);
});

const deps = { db, cost: 4 };
const guide = { login: "Maria.Guide", name: "Мария", role: "guide", password: "guide-pass-1" };
const version = async (id: number) => (await db.select({ v: adminUsers.tokenVersion }).from(adminUsers).where(eq(adminUsers.id, id)))[0].v;
let ip = 0;
const login = (l: string, p: string) => attemptLogin(l, p, `9.9.9.${++ip}`, db);

describe("createAdminUser", () => {
  it("создаёт сотрудника с логином в нижнем регистре и хешем пароля", async () => {
    const r = await createAdminUser(guide, deps);
    expect(r.ok).toBe(true);
    const [u] = await db.select().from(adminUsers);
    expect(u).toMatchObject({ login: "maria.guide", name: "Мария", role: "guide", active: true, tokenVersion: 0 });
    expect(await bcrypt.compare("guide-pass-1", u.passwordHash)).toBe(true);
  });

  it("логин занят — в том числе в другом регистре и логином владельца", async () => {
    await createAdminUser(guide, deps);
    expect(await createAdminUser({ ...guide, login: "MARIA.GUIDE" }, deps)).toEqual({ ok: false, fieldErrors: { login: "Этот логин занят" } });
    expect(await createAdminUser({ ...guide, login: "Owner" }, deps)).toEqual({ ok: false, fieldErrors: { login: "Этот логин занят" } });
  });

  it("проверяет поля: логин, имя, роль, длина пароля", async () => {
    const r = await createAdminUser({ login: "мария", name: " ", role: "owner", password: "short" }, deps);
    expect(r.ok).toBe(false);
    expect(!r.ok && Object.keys(r.fieldErrors).sort()).toEqual(["login", "name", "password", "role"]);
    expect(await listAdminUsers(db)).toEqual([]);
  });
});

describe("вход сотрудника", () => {
  it("вход без учёта регистра логина; токен сотрудника; время последнего входа", async () => {
    const c = await createAdminUser(guide, deps);
    const id = c.ok ? c.id : 0;
    const r = await login("MARIA.guide", "guide-pass-1");
    expect(r.ok).toBe(true);
    expect(await readSessionToken(r.ok ? r.token : "")).toEqual({ kind: "user", id, v: 0 });
    expect((await getAdminUser(id, db))!.lastLoginAt).toBeInstanceOf(Date);
  });

  it("неверный пароль, неизвестный логин и отключённый сотрудник — одна и та же ошибка", async () => {
    const c = await createAdminUser(guide, deps);
    expect(await login("maria.guide", "wrong-pass")).toEqual({ ok: false, error: LOGIN_ERROR });
    expect(await login("nobody", "guide-pass-1")).toEqual({ ok: false, error: LOGIN_ERROR });
    await db.update(adminUsers).set({ active: false }).where(eq(adminUsers.id, c.ok ? c.id : 0));
    expect(await login("maria.guide", "guide-pass-1")).toEqual({ ok: false, error: LOGIN_ERROR });
  });

  it("владелец входит по-прежнему, его токен с отпечатком учётки", async () => {
    const r = await login("owner", "owner-pass");
    expect(await readSessionToken(r.ok ? r.token : "")).toEqual({ kind: "owner", v: ownerFingerprint() });
  });
});

describe("resolveViewer", () => {
  it("сотрудник: действует, пока версия совпадает и вход не отключён", async () => {
    const c = await createAdminUser(guide, deps);
    const id = c.ok ? c.id : 0;
    expect(await resolveViewer({ kind: "user", id, v: 0 }, db)).toEqual({ id, login: "maria.guide", name: "Мария", role: "guide" });
    expect(await resolveViewer({ kind: "user", id, v: 1 }, db)).toBeNull();
    expect(await resolveViewer({ kind: "user", id: id + 1, v: 0 }, db)).toBeNull();
    await db.update(adminUsers).set({ active: false }).where(eq(adminUsers.id, id));
    expect(await resolveViewer({ kind: "user", id, v: 0 }, db)).toBeNull();
  });

  it("владелец: только с отпечатком текущей учётки", async () => {
    expect(await resolveViewer({ kind: "owner", v: ownerFingerprint()! }, db)).toMatchObject({ id: null, role: "owner" });
    expect(await resolveViewer({ kind: "owner", v: "stale" }, db)).toBeNull();
  });
});

describe("updateAdminUser", () => {
  async function made() {
    const c = await createAdminUser(guide, deps);
    if (!c.ok) throw new Error("create");
    return c.id;
  }
  const same = { name: "Мария", role: "guide", active: true, password: "" };

  it("смена имени не выкидывает из админки; смена роли, пароля или отключение — выкидывает", async () => {
    const id = await made();
    expect(await updateAdminUser(id, { ...same, name: "Мария И." }, { id: null }, deps)).toEqual({ ok: true, id });
    expect(await version(id)).toBe(0);

    await updateAdminUser(id, { ...same, role: "admin" }, { id: null }, deps);
    expect(await version(id)).toBe(1);
    await updateAdminUser(id, { ...same, role: "admin", password: "new-password-1" }, { id: null }, deps);
    expect(await version(id)).toBe(2);
    expect((await login("maria.guide", "new-password-1")).ok).toBe(true);
    await updateAdminUser(id, { ...same, role: "admin", active: false }, { id: null }, deps);
    expect(await version(id)).toBe(3);
  });

  it("себе нельзя сменить роль и отключить вход; имя и пароль — можно", async () => {
    const id = await made();
    const self = { id };
    expect((await updateAdminUser(id, { ...same, role: "admin" }, self, deps)).ok).toBe(false);
    expect((await updateAdminUser(id, { ...same, active: false }, self, deps)).ok).toBe(false);
    expect((await updateAdminUser(id, { ...same, name: "Маша", password: "my-new-pass-1" }, self, deps)).ok).toBe(true);
    expect(await getAdminUser(id, db)).toMatchObject({ name: "Маша", role: "guide", active: true });
  });

  it("короткий новый пароль и несуществующий сотрудник — ошибки", async () => {
    const id = await made();
    expect(await updateAdminUser(id, { ...same, password: "short" }, { id: null }, deps)).toMatchObject({ ok: false, fieldErrors: { password: expect.any(String) } });
    expect(await updateAdminUser(id + 100, same, { id: null }, deps)).toMatchObject({ ok: false, error: "Сотрудник не найден" });
  });
});
