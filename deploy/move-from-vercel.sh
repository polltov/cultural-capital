#!/usr/bin/env bash
# Разовый переезд данных с Vercel в Селектел. Запускается на сервере после первой выкладки (README, «Переезд данных»):
#   bash ~/app/src/deploy/move-from-vercel.sh 'postgresql://…neon.tech/…?sslmode=require'
# Аргумент — строка подключения к старой базе Neon (DATABASE_URL_UNPOOLED из настроек Vercel: без «-pooler»).
#   1. копирует все данные из Neon в базу Селектела (кроме IP-адресов защиты от спама);
#   2. переносит фото из Vercel Blob в хранилище Селектела и меняет их адреса в базе;
#   3. пересобирает сайт, чтобы страницы собрались уже с данными.
# Новая база должна быть пустой (только что после миграций): если в ней есть заказы, скрипт остановится.
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/app}"
cd "$APP_DIR"
fail() { echo "ОШИБКА: $*" >&2; exit 1; }

old="${1:-}"
[ -n "$old" ] || fail "передайте строку подключения к старой базе: bash $0 'postgresql://…'"
new="$(grep -E '^DATABASE_URL=' app.env | tail -n1 | cut -d= -f2- | sed -E "s/^['\"]//; s/['\"]\r?$//")"
[ -n "$new" ] || fail "в app.env не задан DATABASE_URL"

PG_IMAGE="${PG_IMAGE:-postgres:18-alpine}"
# новая база — с сертификатом Селектела; старая — без него (иначе libpq проверял бы им сертификат Neon)
pg() { docker run --rm -i -v "$APP_DIR/certs:/certs:ro" -e PGSSLROOTCERT=/certs/root.crt "$PG_IMAGE" "$@"; }
pg_old() { docker run --rm "$PG_IMAGE" "$@"; }

echo "== проверка новой базы"
orders="$(pg psql "$new" -X -tA -c 'SELECT count(*) FROM orders')" || fail "новая база недоступна или без таблиц — сначала выкладка (deploy.sh)"
[ "$orders" = "0" ] || [ "${FORCE:-}" = "1" ] || fail "в новой базе уже $orders заказов — перенос затёр бы их. Если это точно нужно: FORCE=1 bash $0 …"
tables="$(pg psql "$new" -X -tA -c "SELECT string_agg(format('%I.%I', schemaname, tablename), ', ') FROM pg_tables WHERE schemaname = 'public'")"

echo "== копирование базы (одной транзакцией: при ошибке новая база не меняется)"
{
  # в новой базе сейчас только строки, которые добавили миграции (вопросы-ответы); их заменят данные из старой
  echo "TRUNCATE $tables RESTART IDENTITY CASCADE;"
  pg_old pg_dump "$old" --data-only --no-owner --no-privileges --schema=public --exclude-table-data=public.rate_limit_hits
} | pg psql "$new" -X -q -v ON_ERROR_STOP=1 --single-transaction
pg psql "$new" -X -tA -c "SELECT 'экскурсий: ' || (SELECT count(*) FROM tours) || ', сеансов: ' || (SELECT count(*) FROM tour_sessions) || ', заказов: ' || (SELECT count(*) FROM orders) || ', новостей: ' || (SELECT count(*) FROM news) || ', сотрудников: ' || (SELECT count(*) FROM admin_users)"

echo "== перенос фото"
docker compose run --rm -T tools npx tsx scripts/move-images.ts

echo "== пересборка сайта с перенесёнными данными"
bash "$APP_DIR/src/deploy/deploy.sh"
