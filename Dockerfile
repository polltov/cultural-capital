# syntax=docker/dockerfile:1.7
# Образ сайта для сервера в Селектеле. Собирается на самом сервере скриптом deploy/deploy.sh:
#   app   — сайт (`node server.js` из .next/standalone);
#   tools — полный набор зависимостей для миграций, сида и разовых скриптов (docker compose run --rm tools …).
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
# Страницы с данными из базы (главная, афиша, экскурсии) собираются заранее, поэтому сборке нужны те же переменные,
# что и сайту: файл app.env передаётся секретом и в слои образа не попадает. Копии .env, которые Next мог положить
# в standalone, удаляются в том же шаге.
RUN --mount=type=secret,id=appenv,target=/app/.env.production.local \
    npm run build && rm -f .next/standalone/.env*

FROM ${NODE_IMAGE} AS app
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --chown=node:node deploy/cron.mjs ./cron.mjs
# Кэш уменьшенных фото переживает перевыкладку (том в deploy/compose.yml).
RUN mkdir -p .next/cache/images && chown -R node:node .next/cache
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/robots.txt').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "server.js"]
