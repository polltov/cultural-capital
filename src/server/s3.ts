import { createHash, createHmac } from "node:crypto";

/**
 * Минимальный клиент S3 (объектное хранилище Селектела или любое S3-совместимое): подпись запроса AWS Signature V4
 * и загрузка файла запросом PUT. Как и с ЮKassa и Telegram, обходимся `fetch` без SDK: нужен один запрос.
 */

export type S3Config = {
  /** Адрес S3 API, например `https://s3.ru-1.storage.selcloud.ru`. */
  endpoint: string;
  /** Регион (у Селектела — пул, например `ru-1`). */
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Публичный адрес файлов контейнера; к нему дописывается ключ файла. */
  publicUrl: string;
};

/** Настройки из окружения; `null`, если чего-то не хватает (тогда загрузка фото недоступна). */
export function s3Config(env: Record<string, string | undefined> = process.env): S3Config | null {
  const value = (k: string) => (env[k] ?? "").trim();
  const cfg = {
    endpoint: value("S3_ENDPOINT").replace(/\/+$/, ""),
    region: value("S3_REGION"),
    bucket: value("S3_BUCKET"),
    accessKeyId: value("S3_ACCESS_KEY_ID"),
    secretAccessKey: value("S3_SECRET_ACCESS_KEY"),
    publicUrl: value("S3_PUBLIC_URL").replace(/\/+$/, ""),
  };
  return Object.values(cfg).every(Boolean) ? cfg : null;
}

const sha256 = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");
const hmac = (key: string | Buffer, data: string) => createHmac("sha256", key).update(data).digest();

/** Кодирование частей пути по правилам S3: всё, кроме `A–Z a–z 0–9 - _ . ~`, — в %XX; `/` между частями остаётся. */
export function encodeKey(key: string): string {
  return key
    .split("/")
    .map((part) => encodeURIComponent(part).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`))
    .join("/");
}

/** `20130524T000000Z` — формат даты подписи. */
export function amzDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export type SignInput = {
  method: string;
  host: string;
  /** Путь, уже закодированный (`encodeKey`), со слешем в начале. */
  path: string;
  /** Заголовки, которые надо подписать (кроме host): имена в любом регистре. Должен быть `x-amz-date`. */
  headers: Record<string, string>;
  payloadHash: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
};

/** Заголовок `Authorization` по AWS Signature V4 (сервис s3, запрос без query-параметров). */
export function authorization(i: SignInput): string {
  const all: Record<string, string> = { host: i.host };
  for (const [k, v] of Object.entries(i.headers)) all[k.toLowerCase()] = v.trim().replace(/\s+/g, " ");
  const names = Object.keys(all).sort();
  const signedHeaders = names.join(";");
  const date = all["x-amz-date"];
  if (!date) throw new Error("x-amz-date обязателен для подписи");
  const day = date.slice(0, 8);
  const canonical = [i.method, i.path, "", ...names.map((n) => `${n}:${all[n]}`), "", signedHeaders, i.payloadHash].join("\n");
  const scope = `${day}/${i.region}/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", date, scope, sha256(canonical)].join("\n");
  const key = hmac(hmac(hmac(hmac(`AWS4${i.secretAccessKey}`, day), i.region), "s3"), "aws4_request");
  const signature = createHmac("sha256", key).update(toSign).digest("hex");
  return `AWS4-HMAC-SHA256 Credential=${i.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

/**
 * Кладёт файл в контейнер (адрес в стиле `endpoint/bucket/key`) и возвращает его публичный адрес.
 * Бросает Error с кодом ответа хранилища; тело ответа и ключи в текст ошибки не попадают.
 */
export async function putObject(
  cfg: S3Config,
  key: string,
  body: Uint8Array,
  opts: { contentType: string; cacheControl?: string },
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<string> {
  const base = new URL(cfg.endpoint);
  const path = `${base.pathname.replace(/\/+$/, "")}/${encodeKey(cfg.bucket)}/${encodeKey(key)}`;
  const payloadHash = sha256(body);
  const headers: Record<string, string> = {
    "content-type": opts.contentType,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate(now),
  };
  if (opts.cacheControl) headers["cache-control"] = opts.cacheControl;
  const auth = authorization({
    method: "PUT", host: base.host, path, headers, payloadHash,
    region: cfg.region, accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey,
  });
  const res = await fetchImpl(`${base.origin}${path}`, {
    method: "PUT",
    headers: { ...headers, authorization: auth },
    body: new Blob([body as Uint8Array<ArrayBuffer>]),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const code = /<Code>([^<]{1,100})<\/Code>/.exec(detail)?.[1];
    throw new Error(`S3: файл не загружен, ответ ${res.status}${code ? ` ${code}` : ""}`);
  }
  return `${cfg.publicUrl}/${encodeKey(key)}`;
}
