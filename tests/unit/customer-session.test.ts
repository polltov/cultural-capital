import { beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { signCustomerSession, verifyCustomerSession } from "@/lib/auth/customer";
import { ownerFingerprint, readSessionToken, signSession } from "@/lib/auth/session";

beforeAll(() => {
  process.env.SESSION_SECRET = "unit-test-secret-0123456789abcdef0123456789abcdef";
  process.env.ADMIN_LOGIN = "admin";
  process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync("x", 4);
});

describe("сессия личного кабинета", () => {
  it("свой токен — email; мусор — null", async () => {
    expect(await verifyCustomerSession(await signCustomerSession("anna@example.com"))).toBe("anna@example.com");
    expect(await verifyCustomerSession("")).toBeNull();
    expect(await verifyCustomerSession("a.b.c")).toBeNull();
  });

  it("токены админки и кабинета не взаимозаменяемы", async () => {
    const admin = await signSession({ kind: "owner", v: ownerFingerprint()! });
    expect(await verifyCustomerSession(admin)).toBeNull();
    expect(await readSessionToken(await signCustomerSession("anna@example.com"))).toBeNull();
  });
});
