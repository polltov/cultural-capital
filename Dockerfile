# syntax=docker/dockerfile:1.7
# Образ сайта для сервера в Селектеле. Собирается в GitHub Actions (.github/workflows/deploy.yml) и приходит на сервер
# готовым — на сервере с 1 ГБ памяти сборка Next не поместилась бы:
#   app   — сайт (`node server.js` из .next/standalone) и миграции базы (`node migrate.mjs`);
#   tools — полный набор зависимостей для сида и разовых скриптов (docker compose run --rm tools …), собирается
#           на сервере только когда нужен.
# Если Docker Hub с сервера недоступен, базовый образ можно взять из зеркала: --build-arg NODE_IMAGE=…
ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM deps AS tools
COPY . .
CMD ["npm", "run", "db:migrate"]

FROM deps AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
# Страницы с данными из базы (главная, афиша) собираются заранее, поэтому сборке нужна база (в GitHub Actions —
# временная пустая, после выкладки страницы обновляются из боевой) и адреса из deploy/build.env: файл передаётся
# секретом и в слои образа не попадает. Копии .env, которые Next мог положить в standalone, удаляются в том же шаге.
RUN --mount=type=secret,id=appenv,target=/app/.env.production.local \
    npm run build && rm -f .next/standalone/.env*

FROM ${NODE_IMAGE} AS app
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --chown=node:node deploy/cron.mjs ./cron.mjs
# Миграции: deploy.sh запускает их из нового образа до перезапуска сайта. Next кладёт в standalone только те файлы
# drizzle-orm и postgres, что нужны сайту (мигратора там нет), поэтому оба пакета копируются целиком — зависимостей
# у них нет.
COPY --from=deps --chown=node:node /app/node_modules/drizzle-orm ./node_modules/drizzle-orm
COPY --from=deps --chown=node:node /app/node_modules/postgres ./node_modules/postgres
COPY --chown=node:node drizzle ./drizzle
COPY --chown=node:node deploy/migrate.mjs ./migrate.mjs
# Кэш уменьшенных фото переживает перевыкладку (том в deploy/compose.yml).
RUN mkdir -p .next/cache/images && chown -R node:node .next/cache
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/robots.txt').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "server.js"]
