import { describe, it, expect, beforeAll } from "vitest";
import bcrypt from "bcryptjs";
import { db } from "@/db/client";
import { attemptLogin, LOGIN_ERROR, LOGIN_BLOCKED } from "@/server/admin-auth";
import { countRateLimit, hitRateLimit } from "@/server/rate-limit";

beforeAll(() => {
  process.env.SESSION_SECRET = "int-test-secret-0123456789abcdef0123456789abcdef";
  process.env.ADMIN_LOGIN = "admin";
  process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync("right-pass", 4);
});

describe("attemptLogin", () => {
  it("succeeds with right credentials and returns a token", async () => {
    const r = await attemptLogin("admin", "right-pass", "1.1.1.1", db);
    expect(r.ok).toBe(true);
    expect(r.ok && r.token).toBeTruthy();
  });

  it("same generic error for wrong login and wrong password", async () => {
    expect(await attemptLogin("admin", "nope", "1.1.1.1", db)).toEqual({ ok: false, error: LOGIN_ERROR });
    expect(await attemptLogin("nobody", "right-pass", "1.1.1.1", db)).toEqual({ ok: false, error: LOGIN_ERROR });
    expect(LOGIN_ERROR).toBe("Неверный логин или пароль");
  });

  it("blocks the 6th attempt after 5 failures even with the right password", async () => {
    for (let i = 0; i < 5; i++) {
      expect(await attemptLogin("admin", `bad${i}`, "2.2.2.2", db)).toEqual({ ok: false, error: LOGIN_ERROR });
    }
    expect(await attemptLogin("admin", "right-pass", "2.2.2.2", db)).toEqual({ ok: false, error: LOGIN_BLOCKED });
    expect(LOGIN_BLOCKED).toBe("Слишком много попыток. Подождите 15 минут.");
    // другой IP не затронут
    expect((await attemptLogin("admin", "right-pass", "3.3.3.3", db)).ok).toBe(true);
  });

  it("concurrent burst from one IP gets at most 5 guesses", async () => {
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => attemptLogin("admin", `burst${i}`, "5.5.5.5", db)));
    const failures = results.filter((r) => !r.ok && r.error === LOGIN_ERROR).length;
    const blocked = results.filter((r) => !r.ok && r.error === LOGIN_BLOCKED).length;
    expect(failures).toBeLessThanOrEqual(5);
    expect(failures + blocked).toBe(10);
    expect(await countRateLimit("login:5.5.5.5", 900, db)).toBeLessThanOrEqual(5);
    expect(await attemptLogin("admin", "right-pass", "5.5.5.5", db)).toEqual({ ok: false, error: LOGIN_BLOCKED });
  });

  it("successful logins do not count; success clears earlier failures", async () => {
    for (let i = 0; i < 4; i++) await attemptLogin("admin", "bad", "4.4.4.4", db);
    expect((await attemptLogin("admin", "right-pass", "4.4.4.4", db)).ok).toBe(true);
    for (let i = 0; i < 4; i++) await attemptLogin("admin", "bad", "4.4.4.4", db);
    expect((await attemptLogin("admin", "right-pass", "4.4.4.4", db)).ok).toBe(true);
  });

  it("order rate limit semantics unchanged", async () => {
    for (let i = 0; i < 2; i++) expect(await hitRateLimit("order:x", 2, 60, db)).toBe(true);
    expect(await hitRateLimit("order:x", 2, 60, db)).toBe(false);
  });
});
