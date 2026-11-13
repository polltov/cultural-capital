import { formatMonthTitle, moscowMonthKey } from "./moscow-time";

export type ScheduleSession = { id: number; startsAt: Date; free: number };

/** Строка афиши: один сеанс одной экскурсии. */
export type ScheduleItem<T> = { tour: T; session: ScheduleSession };

export type ScheduleMonth<T> = { key: string; title: string; items: ScheduleItem<T>[] };

/**
 * Все сеансы каталога одной лентой по времени начала. При одинаковом времени порядок — как в каталоге
 * (сортировка устойчивая). Каталог уже содержит только будущие нескрытые сеансы опубликованных экскурсий.
 */
export function scheduleOf<T>(catalog: { tour: T; sessions: ScheduleSession[] }[], limit?: number): ScheduleItem<T>[] {
  const items = catalog
    .flatMap(({ tour, sessions }) => sessions.map((session) => ({ tour, session })))
    .sort((a, b) => a.session.startsAt.getTime() - b.session.startsAt.getTime());
  return limit === undefined ? items : items.slice(0, limit);
}

/** Афиша по месяцам (по московскому времени), месяцы и сеансы внутри — по порядку. */
export function groupByMonth<T>(items: ScheduleItem<T>[], now: Date = new Date()): ScheduleMonth<T>[] {
  const months: ScheduleMonth<T>[] = [];
  for (const item of items) {
    const key = moscowMonthKey(item.session.startsAt);
    let month = months.at(-1);
    if (!month || month.key !== key) {
      month = { key, title: formatMonthTitle(item.session.startsAt, now), items: [] };
      months.push(month);
    }
    month.items.push(item);
  }
  return months;
}

/** Ближайший сеанс, на который ещё есть места, — для подсказки «ближайшая экскурсия». */
export function nextAvailable<T>(items: ScheduleItem<T>[]): ScheduleItem<T> | null {
  return items.find((i) => i.session.free > 0) ?? null;
}
