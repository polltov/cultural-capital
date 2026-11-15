import { describe, expect, it, vi } from "vitest";
import { amzDate, authorization, encodeKey, putObject, s3Config } from "@/server/s3";

// Эталонные примеры из документации AWS «Signature Version 4: Authenticating Requests (Authorization Header)».
const creds = { accessKeyId: "AKIAIOSFODNN7EXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", region: "us-east-1" };
const EMPTY = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

describe("authorization (AWS Signature V4)", () => {
  it("GET Object из документации AWS", () => {
    const auth = authorization({
      ...creds, method: "GET", host: "examplebucket.s3.amazonaws.com", path: "/test.txt", payloadHash: EMPTY,
      headers: { Range: "bytes=0-9", "x-amz-content-sha256": EMPTY, "x-amz-date": "20130524T000000Z" },
    });
    expect(auth).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, " +
        "SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, " +
        "Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
    );
  });

  it("PUT Object из документации AWS (с кодированием `$` в имени)", () => {
    const hash = "44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072"; // sha256("Welcome to Amazon S3.")
    const auth = authorization({
      ...creds, method: "PUT", host: "examplebucket.s3.amazonaws.com", path: `/${encodeKey("test$file.text")}`, payloadHash: hash,
      headers: {
        Date: "Fri, 24 May 2013 00:00:00 GMT",
        "x-amz-date": "20130524T000000Z",
        "x-amz-storage-class": "REDUCED_REDUNDANCY",
        "x-amz-content-sha256": hash,
      },
    });
    expect(auth).toMatch(/Signature=98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd$/);
  });
});

describe("encodeKey / amzDate", () => {
  it("кодирует части пути, оставляя слеши", () => {
    expect(encodeKey("tours/a b(1)!.jpg")).toBe("tours/a%20b%281%29%21.jpg");
    expect(encodeKey("news/фото.png")).toBe("news/%D1%84%D0%BE%D1%82%D0%BE.png");
  });
  it("дата подписи без разделителей и миллисекунд", () => {
    expect(amzDate(new Date("2026-11-15T09:08:07.123Z"))).toBe("20261115T090807Z");
  });
});

describe("s3Config", () => {
  const env = {
    S3_ENDPOINT: "https://s3.ru-1.storage.selcloud.ru/", S3_REGION: "ru-1", S3_BUCKET: "b",
    S3_ACCESS_KEY_ID: "k", S3_SECRET_ACCESS_KEY: "s", S3_PUBLIC_URL: "https://x.selstorage.ru/",
  };
  it("убирает слеши в конце адресов", () => {
    expect(s3Config(env)).toMatchObject({ endpoint: "https://s3.ru-1.storage.selcloud.ru", publicUrl: "https://x.selstorage.ru" });
  });
  it("null, если чего-то не хватает", () => {
    expect(s3Config({ ...env, S3_BUCKET: " " })).toBeNull();
    expect(s3Config({})).toBeNull();
  });
});

describe("putObject", () => {
  it("PUT по адресу endpoint/bucket/key с хэшем тела; публичный адрес — publicUrl/key", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }));
    const cfg = s3Config({
      S3_ENDPOINT: "https://s3.ru-1.storage.selcloud.ru", S3_REGION: "ru-1", S3_BUCKET: "kc", S3_ACCESS_KEY_ID: "k",
      S3_SECRET_ACCESS_KEY: "s", S3_PUBLIC_URL: "https://x.selstorage.ru",
    })!;
    const url = await putObject(cfg, "tours/a.jpg", new TextEncoder().encode("Welcome to Amazon S3."), { contentType: "image/jpeg" },
      fetchImpl, new Date("2026-11-15T00:00:00Z"));
    expect(url).toBe("https://x.selstorage.ru/tours/a.jpg");
    const [target, init] = fetchImpl.mock.calls[0];
    expect(String(target)).toBe("https://s3.ru-1.storage.selcloud.ru/kc/tours/a.jpg");
    const h = new Headers(init!.headers);
    expect(h.get("x-amz-content-sha256")).toBe("44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072");
    expect(h.get("x-amz-date")).toBe("20261115T000000Z");
    expect(h.get("authorization")).toContain("Credential=k/20261115/ru-1/s3/aws4_request");
  });
});
