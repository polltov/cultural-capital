// Расписание задач сайта (вместо Vercel Cron). Работает отдельным контейнером `cron` из того же образа и раз в минуту
// сверяет время UTC с расписанием; задачу вызывает запросом к сайту с `Authorization: Bearer ${CRON_SECRET}`.
// Ответ и ошибки — в журнал контейнера: docker compose logs cron.

const JOBS = [
  // Ночная задача платежей: 00:00 UTC = 03:00 по Москве
  { path: "/api/cron/nightly", hour: 0, minute: 0 },
  // Дневная задача писем (напоминания накануне, «вы не завершили оплату»): 15:00 UTC = 18:00 по Москве
  { path: "/api/cron/daily", hour: 15, minute: 0 },
];

const target = (process.env.CRON_TARGET || "http://app:3000").replace(/\/+$/, "");
const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error("CRON_SECRET не задан — задачи не запускаются");
  process.exit(1);
}

const log = (...a) => console.log(new Date().toISOString(), ...a);

async function run(path) {
  try {
    const res = await fetch(`${target}${path}`, {
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(10 * 60_000),
    });
    log(path, res.status, (await res.text()).slice(0, 500));
  } catch (e) {
    log(path, "ошибка:", e instanceof Error ? e.message : String(e));
  }
}

let last = "";
function tick() {
  const now = new Date();
  const stamp = now.toISOString().slice(0, 16);
  if (stamp === last) return;
  last = stamp;
  for (const job of JOBS) {
    if (now.getUTCHours() === job.hour && now.getUTCMinutes() === job.minute) void run(job.path);
  }
}

log("расписание:", JOBS.map((j) => `${j.path} в ${String(j.hour).padStart(2, "0")}:${String(j.minute).padStart(2, "0")} UTC`).join(", "));
if (process.argv[2]) {
  // Ручной запуск: docker compose run --rm cron node cron.mjs /api/cron/nightly
  await run(process.argv[2]);
} else {
  setInterval(tick, 15_000);
  tick();
}
