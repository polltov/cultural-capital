import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ revalidatePublicSite: vi.fn() }));

vi.mock("@/server/revalidate", () => ({ revalidatePublicSite: mocks.revalidatePublicSite }));

import { POST } from "@/app/api/cron/revalidate/route";

const call = (authorization?: string) =>
  POST(
    new Request("http://x.test/api/cron/revalidate", {
      method: "POST",
      headers: authorization === undefined ? {} : { authorization },
    }),
  );

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CRON_SECRET", "s3cret");
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/cron/revalidate", () => {
  it("the right secret → the public site's cache is dropped", async () => {
    const res = await call("Bearer s3cret");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mocks.revalidatePublicSite).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, "", "Bearer wrong", "s3cret", "Bearer s3cret!"])("a wrong or missing header «%s» → 401", async (header) => {
    expect((await call(header)).status).toBe(401);
    expect(mocks.revalidatePublicSite).not.toHaveBeenCalled();
  });

  it("without CRON_SECRET nobody gets in, even with «Bearer undefined»", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer undefined")).status).toBe(401);
    expect((await call("Bearer ")).status).toBe(401);
    expect(mocks.revalidatePublicSite).not.toHaveBeenCalled();
  });
});
