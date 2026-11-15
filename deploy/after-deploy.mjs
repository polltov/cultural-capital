// После выкладки (deploy.sh, внутри контейнера app): сбрасывает кэш публичных страниц и сразу заходит на них.
// Образ собран в GitHub Actions на пустой базе, поэтому заранее собранные главная, афиша и карта сайта в нём без
// экскурсий; после этого скрипта первые посетители получают страницы с данными боевой базы.
//   docker compose exec -T app node --input-type=module - < src/deploy/after-deploy.mjs
const base = "http://127.0.0.1:3000";

const res = await fetch(`${base}/api/cron/revalidate`, {
  method: "POST",
  headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
});
if (!res.ok) {
  console.error(`обновление страниц не прошло: ${res.status} ${await res.text()}`);
  process.exit(1);
}

// Главная, афиша и новости, затем всё из карты сайта (экскурсии, новости): страницы экскурсий в образе не собраны
// вовсе и строятся при первом заходе — пусть его сделает этот скрипт, а не посетитель.
const paths = new Set(["/", "/afisha", "/news", "/sitemap.xml"]);
const sitemap = await (await fetch(`${base}/sitemap.xml`)).text();
for (const [, loc] of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) paths.add(new URL(loc).pathname);

let failed = 0;
for (const path of paths) {
  const r = await fetch(base + path);
  if (!r.ok) {
    failed++;
    console.error(`${path}: ${r.status}`);
  }
}
console.log(`страницы обновлены: ${paths.size - failed} из ${paths.size}`);
process.exit(failed ? 1 : 0);
