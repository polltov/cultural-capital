#!/bin/sh
# Ночные копии базы — как у сайта гимназии: restic в приватный бакет объектного хранилища Селектела, всё зашифровано,
# хранятся все копии за 7 дней, 14 ежедневных и 8 еженедельных. Работает контейнером backup (deploy/compose.yml), в ~/app:
#   docker compose logs backup                     — журнал копий
#   docker compose run --rm backup now             — сделать копию сейчас
#   docker compose run --rm backup snapshots       — список копий (snapshots <id|latest> — одна копия)
#   bash src/deploy/restore-db.sh <копия|latest>   — восстановить базу (останавливает сайт на время заливки)
# Настройки — ~/app/backup.env (образец deploy/backup.env.example); база — DATABASE_URL из app.env.
set -eu

# Пароль базы — через PGPASSWORD, а не в аргументах команд: аргументы видны в списке процессов сервера.
if [ -n "${DATABASE_URL:-}" ]; then
  PGPASSWORD="$(printf '%s' "$DATABASE_URL" | sed -n 's#^[a-z]*://[^:/@]*:\([^@]*\)@.*#\1#p')"
  export PGPASSWORD
  DB="$(printf '%s' "$DATABASE_URL" | sed 's#^\([a-z]*://[^:/@]*\):[^@]*@#\1@#')"
fi

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*"; }

# Тревога в Telegram, без персональных данных — тем же путём, что уведомления сайта (TELEGRAM_* из app.env).
alert() {
  if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${TELEGRAM_CHAT_ID:-}" ]; then
    log "Telegram не настроен — тревога не отправлена"
    return 0
  fi
  api="${TELEGRAM_API_URL:-}"
  api="${api%/}"
  set -- -fsS -m 15 -o /dev/null -H "content-type: application/json"
  if [ -n "$api" ] && [ -n "${TELEGRAM_RELAY_KEY:-}" ]; then set -- "$@" -H "x-relay-key: $TELEGRAM_RELAY_KEY"; fi
  text="⚠️ Ночная копия базы сайта не сделана. Подробности на сервере: docker compose logs backup"
  curl "$@" --data "{\"chat_id\":\"$TELEGRAM_CHAT_ID\",\"text\":\"$text\"}" \
    "${api:-https://api.telegram.org}/bot$TELEGRAM_BOT_TOKEN/sendMessage" || log "тревога в Telegram не ушла"
}

configured() {
  [ -n "${RESTIC_REPOSITORY:-}" ] && [ -n "${RESTIC_PASSWORD:-}" ] && return 0
  log "нет настроек копий: заполните ~/app/backup.env (README, «Бэкапы»)"
  return 1
}

# Каждый шаг проверяется явно: функция вызывается и из if, где set -e не действует.
backup() {
  configured || return 1
  # коды restic: 10 — хранилища ещё нет (создаём), 12 — неверный RESTIC_PASSWORD, остальное — нет доступа к S3
  rc=0
  restic cat config >/dev/null 2>&1 || rc=$?
  if [ "$rc" = 10 ]; then
    log "хранилища копий ещё нет — создаю"
    restic init || return 1
  elif [ "$rc" = 12 ]; then
    log "неверный RESTIC_PASSWORD в backup.env"
    return 1
  elif [ "$rc" != 0 ]; then
    log "нет доступа к хранилищу копий (restic, код $rc): проверьте RESTIC_REPOSITORY и S3-ключ в backup.env"
    return 1
  fi
  # pg_dump пишет прямо в restic; если он упал, копия не сохраняется. Имя хоста постоянное: у контейнера оно каждый
  # раз новое, а restic считает «14 ежедневных» отдельно для каждого хоста — старые копии не удалялись бы никогда.
  restic backup --quiet --host kc --tag nightly --stdin-filename kc.dump --stdin-from-command -- \
    pg_dump --format=custom --dbname="$DB" || return 1
  # копии за последние 7 дней не удаляются никогда: даже копия пустой базы (например, на новом сервере до
  # восстановления) не вытеснит хорошую копию того же дня
  restic forget --quiet --host kc --tag nightly --keep-within 7d --keep-daily 14 --keep-weekly 8 --prune || return 1
  log "копия сделана"
}

run_backup() {
  if backup; then return 0; fi
  log "ОШИБКА: копия базы не сделана"
  alert
  return 1
}

# 00:30 UTC = 03:30 по Москве: после ночной задачи сайта (00:00 UTC) и в самое тихое время.
schedule() {
  log "копии базы: каждую ночь в 00:30 UTC (03:30 по Москве)"
  configured || true
  last=""
  while :; do
    now="$(date -u +%Y-%m-%dT%H:%M)"
    if [ "${now#*T}" = "00:30" ] && [ "${now%T*}" != "$last" ]; then
      last="${now%T*}"
      run_backup || true
    fi
    sleep 20
  done
}

# Заливает копию в базу целиком, одной транзакцией: схемы public и drizzle пересоздаются, поэтому копия восстановится
# и в базу, ушедшую вперёд (новые таблицы и записи о миграциях после копии исчезнут, следующая выкладка их применит).
restore() {
  configured || return 1
  restic dump --host kc "${1:?какую копию: id или latest}" /kc.dump > /tmp/kc.dump || return 1
  { echo "DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"
    pg_restore --no-owner --file=- /tmp/kc.dump; } |
    PGOPTIONS="-c client_min_messages=warning" psql -X -q -v ON_ERROR_STOP=1 --single-transaction --dbname="$DB" >/dev/null || return 1
  rm -f /tmp/kc.dump
  log "база восстановлена из копии $1"
}

snapshots() {
  configured || return 1
  case "${1:-}" in
    "") restic snapshots --host kc ;;
    latest) restic snapshots --host kc --latest 1 ;;
    *) restic snapshots "$1" ;;
  esac
}

case "${1:-schedule}" in
  schedule) schedule ;;
  now) run_backup ;;
  snapshots) snapshots "${2:-}" ;;
  restore) restore "${2:-}" || { log "ОШИБКА: база не восстановлена, она осталась прежней"; exit 1; } ;;
  *) echo "использование: kc-backup [schedule|now|snapshots|restore <копия>]" >&2; exit 2 ;;
esac
