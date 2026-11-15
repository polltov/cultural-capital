#!/usr/bin/env bash
# Выкладка сайта на сервере. Запускается из GitHub Actions (.github/workflows/deploy.yml) после того, как свежий код
# распакован в ~/app/src, или вручную: bash ~/app/src/deploy/deploy.sh
#   1. проверяет app.env; 2. применяет миграции к базе; 3. собирает образ сайта; 4. перезапускает сайт, расписание
#   задач и HTTPS; 5. ждёт, пока сайт ответит.
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/app}"
cd "$APP_DIR"
fail() { echo "ОШИБКА: $*" >&2; exit 1; }

[ -f app.env ] || fail "нет $APP_DIR/app.env — скопируйте src/deploy/app.env.example в app.env и заполните (README, «Сервер в Селектеле»)"
mkdir -p certs
[ -f certs/root.crt ] || echo "ВНИМАНИЕ: нет certs/root.crt — сертификат базы Селектела (README, «Сервер в Селектеле»)" >&2

# В app.env Docker раскрывает $ в значениях без кавычек, а сборка Next — даже в кавычках: такое значение молча
# испортится. Хешу пароля владельца $ нужен (он используется только при работе сайта) — он в одинарных кавычках;
# в остальных значениях $ быть не должно.
if grep -Eq "^ADMIN_PASSWORD_HASH=[^']*\\$" app.env; then
  fail "ADMIN_PASSWORD_HASH в app.env надо взять в одинарные кавычки: ADMIN_PASSWORD_HASH='\$2b\$12\$...'"
fi
bad="$(grep -E '^[A-Za-z_][A-Za-z0-9_]*=.*\$' app.env | grep -v '^ADMIN_PASSWORD_HASH=' | cut -d= -f1 | paste -sd, - || true)"
[ -z "$bad" ] || fail "в app.env символ \$ в значениях: $bad — замените (например, смените пароль на такой, где нет \$)"

# Домен для HTTPS — из SITE_URL; кириллица переводится в punycode (культурнаястолица.рф → xn--….xn--p1ai).
site_url="$(grep -E '^SITE_URL=' app.env | tail -n1 | cut -d= -f2- | tr -d "\"' \r")"
[ -n "$site_url" ] || fail "в app.env не задан SITE_URL"
domain="$(python3 -c '
import sys, urllib.parse
u = sys.argv[1] if "://" in sys.argv[1] else "https://" + sys.argv[1]
print(urllib.parse.urlsplit(u).hostname.encode("idna").decode())' "$site_url")"
case "$domain" in localhost|*.local|"") fail "SITE_URL ($site_url) должен быть настоящим доменом сайта" ;; esac
printf 'SITE_DOMAIN=%s\n' "$domain" > .env

cp src/deploy/compose.yml src/deploy/Caddyfile .

echo "== миграции базы"
docker compose build tools
docker compose run --rm -T tools npm run db:migrate

echo "== сборка сайта"
docker compose build app

echo "== запуск"
docker compose up -d --remove-orphans app cron caddy
# Caddyfile подключён файлом: новую версию Caddy подхватывает по команде, без обрыва соединений
docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile

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
