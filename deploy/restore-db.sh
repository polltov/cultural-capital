#!/usr/bin/env bash
# Восстановление базы из ночной копии (README, «Бэкапы»). На сервере:
#   bash ~/app/src/deploy/restore-db.sh            — список копий
#   bash ~/app/src/deploy/restore-db.sh <id>       — заменить базу выбранной копией (id — из списка)
#   bash ~/app/src/deploy/restore-db.sh latest     — последней копией (не на новом сервере: там последней может
#                                                    оказаться копия ещё пустой базы — указывайте id)
# На время заливки сайт и расписание задач останавливаются; копия заливается одной транзакцией: если что-то пошло не
# так, база остаётся прежней.
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/app}"
cd "$APP_DIR"
[ -f backup.env ] || { echo "ОШИБКА: нет $APP_DIR/backup.env (README, «Бэкапы»)" >&2; exit 1; }

snap="${1:-}"
if [ -z "$snap" ]; then
  docker compose run --rm -T backup snapshots
  exit 0
fi

echo "Копия, которая будет залита в базу:"
docker compose run --rm -T backup snapshots "$snap"
if [ "${YES:-}" != "1" ]; then
  read -r -p "Все данные сайта будут заменены этой копией. Продолжить? Напишите «да»: " answer
  [ "$answer" = "да" ] || { echo "отменено"; exit 1; }
fi

docker compose stop app cron
trap 'docker compose up -d app cron' EXIT
docker compose run --rm -T backup restore "$snap"
