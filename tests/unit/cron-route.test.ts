import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ runNightly: vi.fn(), notifyAlert: vi.fn() }));

vi.mock("@/server/nightly", () => ({ runNightly: mocks.runNightly }));
vi.mock("@/server/telegram", () => ({ notifyAlert: mocks.notifyAlert }));

import { GET } from "@/app/api/cron/nightly/route";

const report = { synced: 1, expired: 2, closed: 3, done: 4, errors: 0 };
const call = (authorization?: string) =>
  GET(new Request("http://x.test/api/cron/nightly", { headers: authorization === undefined ? {} : { authorization } }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.runNightly.mockResolvedValue(report);
  mocks.notifyAlert.mockResolvedValue(undefined);
  vi.stubEnv("CRON_SECRET", "s3cret");
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/cron/nightly", () => {
  it("without the Authorization header → 401, nothing runs", async () => {
    expect((await call()).status).toBe(401);
    expect(mocks.runNightly).not.toHaveBeenCalled();
  });

  it.each(["Bearer wrong", "s3cret", "bearer s3cret", "Bearer s3cret!", "Basic s3cret", ""])("a wrong header «%s» → 401", async (header) => {
    expect((await call(header)).status).toBe(401);
    expect(mocks.runNightly).not.toHaveBeenCalled();
  });

  it("the right secret → 200 and the report as JSON", async () => {
    const res = await call("Bearer s3cret");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(await res.json()).toEqual(report);
    expect(mocks.runNightly).toHaveBeenCalledTimes(1);
  });

  it("no errors → no alert", async () => {
    await call("Bearer s3cret");
    expect(mocks.notifyAlert).not.toHaveBeenCalled();
  });

  it("errors in the report → one alert to the owner with their number; the report is still returned", async () => {
    const failed = { ...report, errors: 2 };
    mocks.runNightly.mockResolvedValue(failed);
    const res = await call("Bearer s3cret");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(failed);
    expect(mocks.notifyAlert).toHaveBeenCalledExactlyOnceWith("Ночная задача: ошибок — 2. Подробности в логах Vercel.");
  });

  it("an unauthorized call never alerts", async () => {
    mocks.runNightly.mockResolvedValue({ ...report, errors: 5 });
    await call("Bearer wrong");
    expect(mocks.notifyAlert).not.toHaveBeenCalled();
  });

  it("CRON_SECRET unset: «Bearer undefined» does not get in", async () => {
    vi.stubEnv("CRON_SECRET", undefined);
    expect((await call("Bearer undefined")).status).toBe(401);
    expect((await call("Bearer ")).status).toBe(401);
    expect(mocks.runNightly).not.toHaveBeenCalled();
  });

  it("CRON_SECRET empty: «Bearer » does not get in", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer ")).status).toBe(401);
    expect((await call("Bearer")).status).toBe(401);
    expect(mocks.runNightly).not.toHaveBeenCalled();
  });
});
