import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ runDaily: vi.fn(), notifyAlert: vi.fn() }));

vi.mock("@/server/daily", () => ({ runDaily: mocks.runDaily }));
vi.mock("@/server/telegram", () => ({ notifyAlert: mocks.notifyAlert }));

import { GET } from "@/app/api/cron/daily/route";

const call = (authorization?: string) =>
  GET(new Request("http://x.test/api/cron/daily", { headers: authorization === undefined ? {} : { authorization } }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.runDaily.mockResolvedValue({ reminders: 2, abandoned: 1, failed: 0 });
  mocks.notifyAlert.mockResolvedValue(undefined);
  vi.stubEnv("CRON_SECRET", "s3cret");
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/cron/daily", () => {
  it.each([undefined, "Bearer wrong", "s3cret", ""])("без верного секрета (%s) → 401, задача не запускается", async (header) => {
    expect((await call(header)).status).toBe(401);
    expect(mocks.runDaily).not.toHaveBeenCalled();
  });

  it("секрет не задан → 401 даже для «Bearer undefined»", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer undefined")).status).toBe(401);
    expect(mocks.runDaily).not.toHaveBeenCalled();
  });

  it("верный секрет → 200 и отчёт; без сбоев тревоги нет", async () => {
    const res = await call("Bearer s3cret");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reminders: 2, abandoned: 1, failed: 0 });
    expect(mocks.notifyAlert).not.toHaveBeenCalled();
  });

  it("письма не ушли → тревога в Telegram с числом", async () => {
    mocks.runDaily.mockResolvedValue({ reminders: 0, abandoned: 0, failed: 3 });
    await call("Bearer s3cret");
    expect(mocks.notifyAlert).toHaveBeenCalledWith(expect.stringContaining("3"));
  });
});
