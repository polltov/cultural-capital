import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import {
  checkPassword, ownerFingerprint, readSessionToken, signSession, verifySessionToken, verifyCredentials, SESSION_COOKIE,
} from "@/lib/auth/session";

const SECRET = "unit-test-secret-0123456789abcdef0123456789abcdef";

beforeAll(() => {
  process.env.SESSION_SECRET = SECRET;
  process.env.ADMIN_LOGIN = "admin";
  process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync("correct horse", 4);
});
afterEach(() => vi.useRealTimers());

describe("session token", () => {
  it("cookie name", () => expect(SESSION_COOKIE).toBe("cc_admin"));

  const owner = () => ({ kind: "owner" as const, v: ownerFingerprint()! });

  it("accepts own token", async () => {
    expect(await verifySessionToken(await signSession(owner()))).toBe(true);
  });

  it("owner and staff tokens carry who is logged in", async () => {
    expect(await readSessionToken(await signSession(owner()))).toEqual(owner());
    expect(await readSessionToken(await signSession({ kind: "user", id: 7, v: 3 }))).toEqual({ kind: "user", id: 7, v: 3 });
  });

  it("an owner token from before staff accounts (no fingerprint) is not accepted", async () => {
    const legacy = await new SignJWT({ sub: "admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("30d")
      .sign(new TextEncoder().encode(SECRET));
    expect(await readSessionToken(legacy)).toBeNull();
  });

  it("owner fingerprint changes with the password hash", () => {
    const before = ownerFingerprint();
    const h = process.env.ADMIN_PASSWORD_HASH;
    process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync("another", 4);
    try {
      expect(ownerFingerprint()).not.toBe(before);
    } finally {
      process.env.ADMIN_PASSWORD_HASH = h;
    }
    expect(ownerFingerprint()).toBe(before);
  });

  it("rejects token signed with another secret", async () => {
    const forged = await new SignJWT({ sub: "admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("30d")
      .sign(new TextEncoder().encode("another-secret-0123456789abcdef0123456789"));
    expect(await verifySessionToken(forged)).toBe(false);
  });

  it("rejects expired token (after 30 days)", async () => {
    const token = await signSession(owner());
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 31 * 24 * 3600_000);
    expect(await verifySessionToken(token)).toBe(false);
  });

  it("rejects garbage and alg=none", async () => {
    expect(await verifySessionToken("")).toBe(false);
    expect(await verifySessionToken("abc.def.ghi")).toBe(false);
    const none = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from('{"sub":"admin"}').toString("base64url")}.`;
    expect(await verifySessionToken(none)).toBe(false);
  });
});

describe("checkPassword", () => {
  it("true only for a matching hash; no hash → false", async () => {
    const hash = bcrypt.hashSync("secret-pass", 4);
    expect(await checkPassword("secret-pass", hash)).toBe(true);
    expect(await checkPassword("wrong", hash)).toBe(false);
    expect(await checkPassword("secret-pass", null)).toBe(false);
  });
});

describe("verifyCredentials", () => {
  it("accepts correct login and password", async () => {
    expect(await verifyCredentials("admin", "correct horse")).toBe(true);
  });
  it("rejects wrong password", async () => {
    expect(await verifyCredentials("admin", "wrong")).toBe(false);
  });
  it("rejects wrong login", async () => {
    expect(await verifyCredentials("root", "correct horse")).toBe(false);
    expect(await verifyCredentials("", "correct horse")).toBe(false);
  });
  it("rejects when env is not configured", async () => {
    const h = process.env.ADMIN_PASSWORD_HASH;
    delete process.env.ADMIN_PASSWORD_HASH;
    try {
      expect(await verifyCredentials("admin", "correct horse")).toBe(false);
    } finally {
      process.env.ADMIN_PASSWORD_HASH = h;
    }
  });
});
