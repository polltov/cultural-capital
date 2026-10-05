import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function create() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL не задан");
  // prepare: false — совместимость с pooled-URL (pgbouncer)
  return drizzle(postgres(url, { max: 5, prepare: false }), { schema });
}

export type Db = ReturnType<typeof create>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// Ленивая инициализация: импорт модуля не требует DATABASE_URL, ошибка — только при первом обращении.
let instance: Db | undefined;
export const db: Db = new Proxy({} as Db, {
  get(_t, prop) {
    instance ??= create();
    const v = Reflect.get(instance, prop, instance);
    return typeof v === "function" ? v.bind(instance) : v;
  },
});
