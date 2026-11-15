#!/usr/bin/env bash
# Выкладка сайта на сервере. Запускается из GitHub Actions (.github/workflows/deploy.yml) после того, как свежий код
# распакован в ~/app/src, или вручную: bash ~/app/src/deploy/deploy.sh
#   1. проверяет app.env; 2. запускает базу и применяет к ней миграции; 3. собирает образ сайта; 4. перезапускает
#   сайт, расписание задач, HTTPS и ночные копии базы; 5. ждёт, пока сайт ответит.
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/app}"
cd "$APP_DIR"
fail() { echo "ОШИБКА: $*" >&2; exit 1; }
umask 077 # .env с паролем базы — только для владельца

[ -f app.env ] || fail "нет $APP_DIR/app.env — скопируйте src/deploy/app.env.example в app.env и заполните (README, «Сервер в Селектеле»)"

# В app.env Docker раскрывает $ в значениях без кавычек, а сборка Next — даже в кавычках: такое значение молча
# испортится. Хешу пароля владельца $ нужен (он используется только при работе сайта) — он в одинарных кавычках;
# в остальных значениях $ быть не должно.
if grep -Eq "^ADMIN_PASSWORD_HASH=[^']*\\$" app.env; then
  fail "ADMIN_PASSWORD_HASH в app.env надо взять в одинарные кавычки: ADMIN_PASSWORD_HASH='\$2b\$12\$...'"
fi
bad="$(grep -E '^[A-Za-z_][A-Za-z0-9_]*=.*\$' app.env | grep -v '^ADMIN_PASSWORD_HASH=' | cut -d= -f1 | paste -sd, - || true)"
[ -z "$bad" ] || fail "в app.env символ \$ в значениях: $bad — замените (например, смените пароль на такой, где нет \$)"

# Домен для HTTPS — из SITE_URL; кириллица переводится в punycode (культурнаястолица.рф → xn--….xn--p1ai).
site_url="$( (grep -E '^SITE_URL=' app.env || true) | tail -n1 | cut -d= -f2- | tr -d "\"' \r")"
[ -n "$site_url" ] || fail "в app.env не задан SITE_URL"
domain="$(python3 -c '
import sys, urllib.parse
u = sys.argv[1] if "://" in sys.argv[1] else "https://" + sys.argv[1]
print(urllib.parse.urlsplit(u).hostname.encode("idna").decode())' "$site_url")"
case "$domain" in localhost|*.local|"") fail "SITE_URL ($site_url) должен быть настоящим доменом сайта" ;; esac

# База — контейнер db на этом сервере; её пароль задаётся только в DATABASE_URL (app.env), отсюда его берёт и сама база.
db_url="$( (grep -E '^DATABASE_URL=' app.env || true) | tail -n1 | cut -d= -f2- | tr -d "\"' \r")"
db_password="$(python3 -c '
import re, sys, urllib.parse
u = urllib.parse.urlsplit(sys.argv[1])
if u.scheme not in ("postgres", "postgresql") or u.hostname != "db" or u.port not in (None, 5432) \
        or u.username != "kc" or u.path != "/kc":
    sys.exit("DATABASE_URL в app.env должен быть вида postgresql://kc:<пароль>@db:5432/kc")
if not re.fullmatch(r"[A-Za-z0-9]{24,}", u.password or ""):
    sys.exit("пароль базы в DATABASE_URL — не короче 24 символов, только латинские буквы и цифры")
print(u.password)' "$db_url")" || fail "исправьте DATABASE_URL в app.env (README, «Сервер в Селектеле»)"
rm -f .env # прежний .env мог быть создан с открытыми правами — umask действует только на новый файл
printf 'SITE_DOMAIN=%s\nDB_PASSWORD=%s\n' "$domain" "$db_password" > .env

cp src/deploy/compose.yml src/deploy/Caddyfile .

echo "== база"
docker compose up -d --wait db
# Пароль из POSTGRES_PASSWORD база берёт только при первом запуске; если его потом сменили в app.env — догоняем.
# Пароль идёт через stdin, не в аргументах (аргументы docker exec попадают в журнал событий Docker); в нём только
# латиница и цифры (проверено выше), так что кавычки в SQL безопасны.
printf "ALTER ROLE kc PASSWORD '%s';\n" "$db_password" | docker compose exec -T db psql -X -q -v ON_ERROR_STOP=1 -U kc -d kc
# адрес контейнера базы во внутренней сети — для сборки сайта (compose.yml, app.build.extra_hosts)
db_ip="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$(docker compose ps -q db)")"
[ -n "$db_ip" ] || fail "не удалось узнать адрес контейнера базы"
printf 'DB_IP=%s\n' "$db_ip" >> .env

echo "== миграции базы"
docker compose build tools
docker compose run --rm -T tools npm run db:migrate

echo "== сборка сайта"
docker compose build app

echo "== запуск"
services=(db app cron caddy)
if [ -f backup.env ]; then
  # сбой сборки образа копий не мешает выложить сайт: прежний контейнер копий продолжит работать
  if docker compose build backup; then
    services+=(backup)
  else
    echo "ВНИМАНИЕ: образ ночных копий не собрался — работает прежний (docker compose logs backup)" >&2
  fi
else
  echo "ВНИМАНИЕ: нет $APP_DIR/backup.env — ночные копии базы не делаются (README, «Бэкапы»)" >&2
fi
docker compose up -d --remove-orphans "${services[@]}"
# Caddyfile подключён файлом: новую версию Caddy подхватывает по команде, без обрыва соединений. Только что
# запущенный Caddy принимает команды не сразу — ждём до 20 секунд, последняя попытка показывает ошибку.
reload_caddy() { docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile "$@"; }
reloaded=""
for _ in $(seq 1 20); do
  if reload_caddy >/dev/null 2>&1; then reloaded=1; break; fi
  sleep 1
done
[ -n "$reloaded" ] || reload_caddy

echo "== проверка"
for _ in $(seq 1 30); do
  if docker compose exec -T app node -e "fetch('http://127.0.0.1:3000/robots.txt').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"; then
    docker image prune -f >/dev/null
    echo "Готово: https://$domain ($(cat src/.git-commit 2>/dev/null || echo 'версия неизвестна'))"
    exit 0
  fi
  sleep 2
done
docker compose logs --tail 50 app >&2
fail "сайт не ответил за минуту после запуска"
