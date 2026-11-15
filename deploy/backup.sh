#!/bin/sh
# Ночные копии базы — как у сайта гимназии: restic в приватный бакет объектного хранилища Селектела, всё зашифровано,
# хранятся 14 ежедневных и 8 еженедельных копий. Работает контейнером backup (deploy/compose.yml), в ~/app:
#   docker compose logs backup                     — журнал копий
#   docker compose run --rm backup now             — сделать копию сейчас
#   docker compose run --rm backup snapshots       — список копий
#   bash src/deploy/restore-db.sh <копия|latest>   — восстановить базу (останавливает сайт на время заливки)
# Настройки — ~/app/backup.env (образец deploy/backup.env.example); база — DATABASE_URL из app.env.
set -eu

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
  if ! restic cat config >/dev/null 2>&1; then
    log "хранилища копий ещё нет — создаю"
    restic init || return 1
  fi
  # pg_dump пишет прямо в restic; если он упал, копия не сохраняется
  restic backup --quiet --tag nightly --stdin-filename kc.dump --stdin-from-command -- \
    pg_dump --format=custom --dbname="$DATABASE_URL" || return 1
  restic forget --quiet --tag nightly --keep-daily 14 --keep-weekly 8 --prune || return 1
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

# Заливает копию в базу целиком: сначала удаляет таблицы, потом создаёт их из копии — одной транзакцией.
restore() {
  configured || return 1
  restic dump "${1:?какую копию: id или latest}" /kc.dump > /tmp/kc.dump || return 1
  pg_restore --clean --if-exists --no-owner --single-transaction --exit-on-error --dbname="$DATABASE_URL" /tmp/kc.dump
  rm -f /tmp/kc.dump
  log "база восстановлена из копии $1"
}

case "${1:-schedule}" in
  schedule) schedule ;;
  now) run_backup ;;
  snapshots) configured && restic snapshots ;;
  restore) restore "${2:-}" ;;
  *) echo "использование: kc-backup [schedule|now|snapshots|restore <копия>]" >&2; exit 2 ;;
esac
