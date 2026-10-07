import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";

/**
 * Запускает `run`, пока снаружи удерживается блокировка `lock`: параллельные вызовы доходят до неё одновременно и встают в очередь.
 * Без этого вызовы разошлись бы по гонке и тест не отличил бы код с `FOR UPDATE` от кода без него.
 */
export async function whileLocked<T>(lock: SQL, run: () => Promise<T>): Promise<T> {
  let release!: () => void;
  let locked!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const isLocked = new Promise<void>((r) => (locked = r));
  const holder = db.transaction(async (tx) => {
    await tx.execute(lock);
    locked();
    await gate;
  });
  await isLocked;
  const result = run();
  await new Promise((r) => setTimeout(r, 300));
  release();
  await holder;
  return result;
}

export const lockOrder = (id: number) => sql`select id from orders where id = ${id} for update`;
export const lockSession = (id: number) => sql`select id from tour_sessions where id = ${id} for update`;
