import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { signSession, verifySessionToken, verifyCredentials, SESSION_COOKIE } from "@/lib/auth/session";

const SECRET = "unit-test-secret-0123456789abcdef0123456789abcdef";

beforeAll(() => {
  process.env.SESSION_SECRET = SECRET;
  process.env.ADMIN_LOGIN = "admin";
  process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync("correct horse", 4);
});
afterEach(() => vi.useRealTimers());

describe("session token", () => {
  it("cookie name", () => expect(SESSION_COOKIE).toBe("cc_admin"));

  it("accepts own token", async () => {
    expect(await verifySessionToken(await signSession())).toBe(true);
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
    const token = await signSession();
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
