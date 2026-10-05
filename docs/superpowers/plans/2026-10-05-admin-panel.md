# Админ-панель «Культурной Столицы» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перевести статичный сайт на Next.js с БД и сделать админку для экскурсий, новостей и заявок с уведомлениями в Telegram.

**Architecture:** Один Next.js-проект (App Router) на Vercel: публичный сайт в route group `(site)`, админка в `/admin`. Данные в Postgres через Drizzle (postgres.js-драйвер, без Neon-специфики), фото в Vercel Blob. Бизнес-логика — чистые функции в `src/lib/domain` + серверные модули в `src/server`, не зависящие от Next API (чтобы их тестировать напрямую); Server Actions — тонкие обёртки.

**Tech Stack:** Next.js 16 (App Router, `proxy.ts`), React 19, TypeScript, Drizzle ORM + drizzle-kit + `postgres`, zod, `jose` (сессия), `bcryptjs`, `@vercel/blob`, `react-markdown` + `remark-gfm`, `@dnd-kit/sortable`, Vitest, Docker (Postgres 17 для интеграционных тестов).

**Spec:** `docs/superpowers/specs/2026-10-05-admin-panel-design.md`

## Global Constraints

- Весь интерфейс (сайт и админка), тексты ошибок и уведомлений — на русском.
- Время сеансов вводится и показывается в `Europe/Moscow`; хранится как `timestamptz`.
- Цены — целые рубли (`integer`), формат вывода `1 390 ₽`.
- Лимит мест сеанса по умолчанию — **8**.
- Места занимают только заявки со статусом `confirmed` и `done`.
- Переходы статусов: `new→confirmed`, `confirmed→done`, `new→cancelled`, `confirmed→cancelled`; остальные отклоняются.
- Номер заявки — `КС-` + 4 цифры с ведущими нулями (`КС-0042`).
- Бейдж на карточке: свободно 1–4 → «осталось N мест» (с правильным склонением), 0 → «мест нет», >4 → нет бейджа.
- Ограничения: заявки — 5 с IP в час; вход — 5 неудачных попыток с IP за 15 минут.
- Сессия админа: httpOnly, Secure, SameSite=Lax cookie, 30 дней.
- Никаких Neon-специфичных API: только `DATABASE_URL` + стандартный Postgres.
- Переменные окружения: `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `ADMIN_LOGIN`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `SITE_URL`.
- Внешний вид публичного сайта не меняется (кроме кнопки «Записаться», модалки записи и блока «Новости»).
- По памяти проекта: после каждой задачи — commit + push в `main`; деплой `vercel deploy --prod` — только начиная с Task 13 (до этого прод остаётся статичным сайтом).
- Next.js 16 отличается от того, что может помнить исполнитель (`proxy.ts` вместо `middleware.ts`, асинхронные `cookies()`/`headers()`, `after()`). Перед кодом сверяться с `node_modules/next/dist/docs/`.

## Review Focus

1. **Часовой пояс:** сеанс, введённый в админке как `2026-10-12T11:00`, показывается как «11:00» на сайте, в админке и в Telegram при любом TZ сервера (Vercel — UTC). → тест в Task 3 (`moscow-time.test.ts`, запуск с `TZ=UTC` и `TZ=Asia/Tokyo`).
2. **Телефон в разных форматах:** `8 (911) 123-45-67`, `+7 911 123 45 67`, `9111234567` → `+79111234567`; `12345`, `+1 555…` → ошибка поля. → тест в Task 3.
3. **Устаревшая страница:** посетитель открыл сайт, а сеанс тем временем прошёл, был скрыт или экскурсию сняли с публикации — заявка отклоняется понятной ошибкой, а не 500. → тест в Task 6.
4. **Отмена и лимит:** отмена подтверждённой заявки освобождает места; уменьшить лимит ниже подтверждённых нельзя; удалить сеанс с заявками нельзя. → тесты в Task 9 и Task 11.
5. **Slug новостей:** кириллица транслитерируется (`Ёлка в Эрмитаже` → `yolka-v-ermitazhe`), повтор заголовка даёт `-2`, HTML в Markdown-тексте не исполняется. → тесты в Task 3 и Task 12.

---

## Файловая структура

```
package.json, tsconfig.json, next.config.ts, drizzle.config.ts, vitest.config.ts
docker-compose.test.yml               Postgres 17 для интеграционных тестов (порт 54329)
.env.example                          все переменные с пояснениями
drizzle/                              SQL-миграции (генерирует drizzle-kit)
public/assets/                        фото и логотипы (из mockups/assets)
src/
  proxy.ts                            защита /admin/*
  db/schema.ts                        таблицы Drizzle
  db/client.ts                        db = drizzle(postgres(DATABASE_URL))
  db/seed-data.ts                     12 экскурсий из текущей вёрстки
  db/seed.ts                          скрипт сида
  lib/domain/                         чистые функции (без БД и Next)
    seats.ts, order-status.ts, pricing.ts, phone.ts, slug.ts, moscow-time.ts, order-number.ts
  lib/validation/                     zod-схемы: booking.ts, tour.ts, news.ts
  lib/auth/session.ts                 cookie-сессия + проверка логина
  server/                             работа с БД (без next/headers, тестируется напрямую)
    rate-limit.ts, orders.ts, catalog.ts, admin-orders.ts, tours.ts, news.ts, telegram.ts, upload.ts
  components/site/                    TicketCard, Catalog, BookingDialog, NewsBlock, ReviewsCarousel, StaticSections, SiteHeader
  components/admin/                   AdminShell, StatusBadge, OrderActions, TourForm, SessionsEditor, NewsForm, MarkdownEditor, ImageDrop, Toast
  app/(site)/layout.tsx, site.css, page.tsx, news/page.tsx, news/[slug]/page.tsx, privacy/page.tsx
  app/(site)/actions.ts               submitBooking
  app/admin/login/page.tsx, app/admin/login/actions.ts
  app/admin/(panel)/layout.tsx, admin.css, page.tsx
  app/admin/(panel)/orders/page.tsx, orders/[id]/page.tsx, orders/actions.ts
  app/admin/(panel)/sessions/[id]/page.tsx, sessions/[id]/csv/route.ts
  app/admin/(panel)/tours/page.tsx, tours/new/page.tsx, tours/[id]/page.tsx, tours/actions.ts
  app/admin/(panel)/news/page.tsx, news/new/page.tsx, news/[id]/page.tsx, news/actions.ts
tests/unit/*.test.ts                  Vitest, без БД
tests/integration/*.test.ts           Vitest + Postgres из docker-compose.test.yml
tests/integration/setup.ts            миграции + TRUNCATE перед каждым тестом
```

Старые `index.html` и `mockups/` удаляются в Task 1 (ассеты переезжают в `public/assets/`); редирект `mockups/direction-d.html` → `/` — в `next.config.ts`.

---

### Task 1: Next.js-каркас и перенос вёрстки 1:1

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `src/app/(site)/layout.tsx`, `src/app/(site)/site.css`, `src/app/(site)/page.tsx`, `src/components/site/{SiteHeader,StaticSections,ReviewsCarousel,TicketCard,Catalog}.tsx`, `public/assets/*`
- Delete: `index.html`, `mockups/`
- Modify: `.gitignore` (+ `.next/`, `.env*.local`), `.claude/launch.json` (команда `npm run dev`, порт 3000)

**Interfaces:**
- Produces: `TicketCard` с пропсами
  `{ tour: { number: number; title: string; subtitle: string; route: string; description: string; note: string | null; durationLabel: string; ageLabel: string; coverUrl: string | null; priceChild: number; priceAdult: number; featured: boolean }; sessions: { id: number; startsAt: Date; free: number }[]; onBook?: (sessionId: number | null) => void }` — используется в Task 5 и как превью в Task 11. На этой задаче `Catalog` рендерит захардкоженный массив из текущей вёрстки.

- [ ] **Step 1:** `npx create-next-app@latest . --ts --app --src-dir --no-tailwind --eslint --import-alias "@/*"` (в существующую папку; сохранить `docs/`, `.github/`). Добавить `vitest`, скрипты `test:unit`, `test:int`, `db:generate`, `db:migrate`, `db:seed`.
- [ ] **Step 2:** Перенести `<style>` из `mockups/direction-d.html` в `site.css` без изменений (пути `assets/…` → `/assets/…`), шрифты Google — через `<link>` в `layout.tsx` как сейчас, `<head>`-мета (title, description, og) — через `metadata`.
- [ ] **Step 3:** Разметку перевести в JSX: шапка, hero, why, route, guides, reviews, faq, footer → `StaticSections`/`SiteHeader`; каталог → `Catalog` + `TicketCard`. Скрипт страницы разнести по клиентским компонентам: раскрытие билета и выбор чипа даты — в `TicketCard` (поведение: клик по закрытой карточке раскрывает, клик по «Купить» в раскрытой — не сворачивает; Enter/Space на карточке переключает), карусель — `ReviewsCarousel`, класс `scrolled` у шапки — `SiteHeader`.
- [ ] **Step 4:** `next.config.ts`: редиректы `/mockups/direction-d.html` и `/index.html` → `/` (permanent).
- [ ] **Step 5: Визуальная проверка.** До удаления `mockups/` снять скриншоты старой страницы (python http.server, 1440px и 375px, закрытые билеты и раскрытый `featured`), затем `npm run dev` и сравнить с новой. Ожидание: визуально идентично, в консоли нет ошибок гидрации.
- [ ] **Step 6:** `npm run build` — без ошибок. Удалить `index.html`, `mockups/`. Commit `feat: migrate static site to Next.js`, push.

---

### Task 2: Схема БД, клиент, тестовая база, подключение Neon и Blob

**Files:**
- Create: `src/db/schema.ts`, `src/db/client.ts`, `drizzle.config.ts`, `docker-compose.test.yml`, `tests/integration/setup.ts`, `tests/integration/schema.test.ts`, `.env.example`, `drizzle/*`

**Interfaces:**
- Produces: Drizzle-таблицы `tours`, `tourSessions`, `orders`, `news`, `rateLimitHits`; enum `orderStatus`; `db` из `@/db/client`; тип `Db = typeof db` и `Tx` (транзакция) — для функций, принимающих `db | tx`.

Схема (сверх полей из спеки):
- `tours.slug` unique; `tours.sortOrder` int default 0; `tours.number` — отображаемый «№ 001» = `sortOrder + 1`, не хранится.
- `tourSessions.capacity` int not null default 8; индекс `(tour_id, starts_at)`.
- `orders.number` — `serial`, unique; `orders.sessionId` FK `on delete restrict`; check `children >= 0 and adults >= 0 and children + adults >= 1`; индексы `(status, created_at)`, `(session_id)`.
- `news.slug` unique; индекс `(published_at)`.
- `rateLimitHits(id, key text, createdAt timestamptz default now())`, индекс `(key, created_at)`.

- [ ] **Step 1: Failing test** `tests/integration/schema.test.ts`: вставка заявки с `children=0, adults=0` бросает ошибку check-constraint; удаление сеанса с заявкой бросает FK-ошибку; два `news` с одинаковым slug — ошибка unique.
- [ ] **Step 2:** `docker compose -f docker-compose.test.yml up -d`; `vitest.config.ts` — два проекта: `unit` (`tests/unit`) и `integration` (`tests/integration`, `setupFiles: setup.ts`, `fileParallelism: false`, env `DATABASE_URL=postgres://postgres:postgres@localhost:54329/test`). `setup.ts`: `migrate()` один раз, `TRUNCATE … RESTART IDENTITY CASCADE` в `beforeEach`. Запуск `npm run test:int` → FAIL (таблиц нет).
- [ ] **Step 3:** Написать `schema.ts`, `client.ts` (`postgres(url, { max: 5 })`, `prepare: false` для pooled-URL Neon), `npm run db:generate`.
- [ ] **Step 4:** `npm run test:int` → PASS.
- [ ] **Step 5: Ресурсы Vercel (нужно подтверждение пользователя: принятие условий Marketplace).** Загрузить skill `vercel:marketplace`; подключить Neon к проекту `cultural-capital` (регион — ближайший к Европе, напр. `fra1`/`aws-eu-central-1`); создать Blob-store и подключить к проекту. `vercel env pull .env.local`. Проверить, что `DATABASE_URL` и `BLOB_READ_WRITE_TOKEN` есть. `npm run db:migrate` против Neon — успешно.
- [ ] **Step 6:** `.env.example` со всеми переменными из Global Constraints и комментариями. Commit `feat: database schema and test infrastructure`, push.

---

### Task 3: Доменные функции

**Files:**
- Create: `src/lib/domain/{seats,order-status,pricing,phone,slug,moscow-time,order-number}.ts`
- Test: `tests/unit/{seats,order-status,pricing,phone,slug,moscow-time,order-number}.test.ts`

**Interfaces (Produces):**
- `seats.ts`: `SEAT_HOLDING_STATUSES = ['confirmed','done'] as const`; `freeSeats(capacity: number, occupied: number): number` (не меньше 0); `seatsBadge(free: number): string | null`; `pluralRu(n: number, forms: [string, string, string]): string`.
- `order-status.ts`: `type OrderStatus = 'new'|'confirmed'|'done'|'cancelled'`; `ORDER_STATUSES`; `STATUS_LABELS: Record<OrderStatus,string>` = «Новая», «Подтверждена», «Проведена», «Отменена»; `canTransition(from, to): boolean`; `nextStatuses(from): OrderStatus[]`.
- `pricing.ts`: `orderTotal(p: { children: number; adults: number; priceChild: number; priceAdult: number }): number`; `formatRub(n: number): string`.
- `phone.ts`: `normalizePhone(input: string): string | null`.
- `slug.ts`: `slugify(title: string): string`; `uniqueSlug(base: string, exists: (s: string) => Promise<boolean>): Promise<string>`.
- `moscow-time.ts`: `parseMoscowLocal(v: string): Date` (из `YYYY-MM-DDTHH:mm`, Москва = UTC+3 без перехода на летнее время); `toMoscowLocalInput(d: Date): string`; `formatDayMonth(d): string` («20 сен»); `formatWeekday(d): string` («вскр», «пн», «вт», «ср», «чт», «пт», «сб» — как в текущей вёрстке); `formatTime(d): string` («11:00»); `formatSessionLong(d): string` («вс, 4 октября 2026, 11:00»).
- `order-number.ts`: `formatOrderNumber(n: number): string`.

- [ ] **Step 1: Failing tests** (ключевые утверждения):
  - `freeSeats(8, 5) === 3`, `freeSeats(8, 10) === 0`; `seatsBadge(4) === 'осталось 4 места'`, `seatsBadge(1) === 'осталось 1 место'`, `seatsBadge(0) === 'мест нет'`, `seatsBadge(5) === null`; `pluralRu(11, …)` → форма «мест», `pluralRu(21, …)` → «место».
  - `canTransition` true ровно для 4 переходов из Global Constraints, для всех остальных 12 пар — false; `nextStatuses('done')` → `[]`.
  - `orderTotal({children:2, adults:1, priceChild:1390, priceAdult:490}) === 3270`; `formatRub(1390) === '1 390 ₽'`.
  - `normalizePhone` для `'8 (911) 123-45-67'`, `'+7 911 123 45 67'`, `'9111234567'`, `'7-911-123-45-67'` → `'+79111234567'`; для `'12345'`, `'+1 555 123 4567'`, `''` → `null`.
  - `slugify('Ёлка в Эрмитаже!') === 'yolka-v-ermitazhe'`, `slugify('  Щука  и  Жук ') === 'shchuka-i-zhuk'`; `uniqueSlug('a', s => Promise.resolve(['a','a-2'].includes(s)))` → `'a-3'`.
  - `parseMoscowLocal('2026-10-12T11:00').toISOString() === '2026-10-12T08:00:00.000Z'`; для этой даты `formatTime` → `'11:00'`, `formatDayMonth` → `'12 окт'`, `formatWeekday` → `'пн'`; `toMoscowLocalInput` — обратное преобразование.
  - `formatOrderNumber(42) === 'КС-0042'`, `formatOrderNumber(12345) === 'КС-12345'`.
- [ ] **Step 2:** `npm run test:unit` → FAIL.
- [ ] **Step 3:** Реализовать. Форматирование — через `Intl.DateTimeFormat` с `timeZone: 'Europe/Moscow'` + собственные массивы коротких месяцев (`янв фев мар апр мая июн июл авг сен окт ноя дек`) и дней недели; транслитерация — собственная таблица (ё→yo, ж→zh, х→kh, ц→ts, ч→ch, ш→sh, щ→shch, ъ/ь→'', ы→y, э→e, ю→yu, я→ya, й→y).
- [ ] **Step 4:** `npm run test:unit`, затем `TZ=UTC npm run test:unit` и `TZ=Asia/Tokyo npm run test:unit` → все PASS.
- [ ] **Step 5:** Commit `feat: domain helpers`, push.

---

### Task 4: Сид из текущей вёрстки

**Files:**
- Create: `src/db/seed-data.ts`, `src/db/seed.ts`
- Test: `tests/integration/seed.test.ts`

**Interfaces:**
- Consumes: таблицы из Task 2, `parseMoscowLocal`, `slugify`.
- Produces: `seed(db: Db): Promise<void>` — идемпотентный (повторный запуск не дублирует: upsert по `tours.slug`; сеансы сида вставляются только если у экскурсии сеансов нет).

- [ ] **Step 1: Failing test:** после `seed(db)` дважды — ровно 12 экскурсий; «Египетский зал Эрмитажа» имеет `priceChild=1390`, `priceAdult=490`, `featured=true`, 2 сеанса (20 сен и 4 окт 2026, 11:00 МСК); у «Тайна первой крепости» `priceChild = priceAdult = 2200`.
- [ ] **Step 2:** Запустить → FAIL.
- [ ] **Step 3:** Переписать все 12 билетов из исходного `direction-d.html` (после Task 1 файла нет — брать `git show cd0c3b6:mockups/direction-d.html`) в `seed-data.ts`: заголовок, t-tag, t-route, описание как Markdown (вступление + список), примечание, длительность, возраст, обложка (`/assets/…` если есть фото, иначе `null` — на сайте останется градиент), цены (если у билета одна цена «/чел» — она идёт в обе), даты и время → сеансы с `capacity` = 8. Год всех дат — 2026. `seed.ts` — CLI-обёртка (`npm run db:seed`).
- [ ] **Step 4:** Тест → PASS. `npm run db:seed` против Neon.
- [ ] **Step 5:** Commit `feat: seed tours from existing markup`, push.

---

### Task 5: Каталог на сайте из БД

**Files:**
- Create: `src/server/catalog.ts`
- Modify: `src/app/(site)/page.tsx`, `src/components/site/{Catalog,TicketCard}.tsx`
- Test: `tests/integration/catalog.test.ts`, `tests/unit/ticket-card.test.tsx` (`@testing-library/react`, jsdom)

**Interfaces:**
- Produces: `getPublishedCatalog(db?: Db): Promise<CatalogTour[]>`, где `CatalogTour = { tour: <пропсы TicketCard.tour> & { id: number; slug: string }; sessions: { id: number; startsAt: Date; free: number }[] }` — только `published`, по `sortOrder`; сеансы только будущие, не `hidden`, по возрастанию даты; `free` считается через `freeSeats` по `SEAT_HOLDING_STATUSES`.

- [ ] **Step 1: Failing tests:**
  - catalog: неопубликованная экскурсия не возвращается; прошедший и скрытый сеансы не возвращаются; при `capacity=8` и подтверждённой заявке на 3 человек + новой на 2 → `free === 5`.
  - ticket-card: при `sessions=[{free:3,…}]` виден текст «осталось 3 места»; при пустом `sessions` — «Даты уточняются» вместо даты и кнопка «Записаться» неактивна; заголовок даты для двух сеансов — «20 сен / 4 окт», подпись — «вскр · 11:00» (если дни недели/время различаются — берутся у первого).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Реализовать. Бейдж — по ближайшему сеансу. Номер на перфорации — `№ 00N` по позиции в списке. Описание — `react-markdown`. Кнопка «Купить» → «Записаться»; в раскрытой карточке вызывает `onBook(выбранный чип ?? null)`. Главная — серверный компонент, читает `getPublishedCatalog()`; кеширование через `revalidatePath('/')` в мутациях (Task 6+, 9, 11).
- [ ] **Step 4:** Тесты PASS; `npm run dev` — главная выглядит как после Task 1.
- [ ] **Step 5:** Commit `feat: render catalog from database`, push.

---

### Task 6: Заявка: сервер, лимиты, Telegram

**Files:**
- Create: `src/lib/validation/booking.ts`, `src/server/rate-limit.ts`, `src/server/orders.ts`, `src/server/telegram.ts`
- Test: `tests/integration/create-order.test.ts`, `tests/integration/rate-limit.test.ts`, `tests/unit/telegram.test.ts`

**Interfaces:**
- Produces:
  - `bookingSchema` (zod): `sessionId: number`, `children: int 0..20`, `adults: int 0..20` (сумма ≥ 1, иначе «Укажите хотя бы одного участника»), `name: 2..80`, `phone` (через `normalizePhone`, иначе «Проверьте номер телефона»), `email` опц. валидный, `comment` ≤ 1000, `consent: literal true` («Нужно согласие на обработку данных»), `website` (honeypot) — должен быть пустым.
  - `type BookingResult = { ok: true; orderId: number; number: string } | { ok: false; error?: string; fieldErrors?: Partial<Record<string, string>> }`
  - `createOrder(input: unknown, ip: string, db?: Db): Promise<BookingResult>`
  - `hitRateLimit(key: string, limit: number, windowSec: number, db?: Db): Promise<boolean>` — пишет попадание и возвращает `false`, если попаданий в окне уже ≥ `limit`. `clearRateLimit(key)` — для успешного входа.
  - `buildOrderMessage(o: { number: string; tourTitle: string; startsAt: Date; children: number; adults: number; total: number; name: string; phone: string; comment: string | null; adminUrl: string }): string`
  - `notifyNewOrder(orderId: number, db?: Db): Promise<void>` — читает заявку, шлёт `sendMessage` (`parse_mode: 'HTML'`, экранирование `<>&`); при ошибке — `console.error`, не бросает.

- [ ] **Step 1: Failing tests:**
  - успех: заявка создаётся со статусом `new`, `number === 'КС-0001'`, цены-слепки и `total` по ценам экскурсии; после смены цены экскурсии `total` заявки не меняется.
  - отказ с `error` (без исключений): несуществующий сеанс; прошедший сеанс; скрытый сеанс; экскурсия не опубликована; свободно 2, запрошено 3 → «Осталось мест: 2».
  - заполненный honeypot → `{ ok: false }` и заявка не создана.
  - `fieldErrors.phone` при `'12345'`; `fieldErrors.consent` без согласия.
  - 6-я заявка с одного IP за час → `error: 'Слишком много заявок. Попробуйте позже или позвоните нам.'`.
  - `buildOrderMessage` содержит «КС-0042», «Египетский зал Эрмитажа», «вс, 4 октября 2026, 11:00», «2 детских + 1 взрослый», «3 270 ₽», телефон и ссылку; `<script>` в имени экранирован.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Реализовать. Проверка мест — обычным запросом без блокировки (места при заявке не резервируются, это намеренно по спеке).
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat: order creation with rate limit and telegram notification`, push.

---

### Task 7: Модалка записи на сайте

**Files:**
- Create: `src/components/site/BookingDialog.tsx`, `src/app/(site)/actions.ts`, `src/app/(site)/privacy/page.tsx`
- Modify: `src/components/site/Catalog.tsx`, `site.css` (стили модалки в стиле сайта)

**Interfaces:**
- Consumes: `createOrder`, `notifyNewOrder`, `formatRub`, `orderTotal`, `CatalogTour`.
- Produces: `submitBooking(prev: BookingResult | null, formData: FormData): Promise<BookingResult>` — берёт IP из `x-forwarded-for` (первый адрес), вызывает `createOrder`, при успехе — `after(() => notifyNewOrder(id))`.

- [ ] **Step 1:** `BookingDialog` на `<dialog>` + `useActionState(submitBooking)`: выбор сеанса (радио-чипы «4 окт, вскр, 11:00 · свободно 5»; без мест — `disabled` «мест нет»; предвыбран сеанс из `onBook`), степперы детей/взрослых (0..min(20, free)) с живой суммой, имя, телефон с маской `+7 (___) ___-__-__`, email, комментарий, чекбокс согласия со ссылкой на `/privacy`, скрытое поле `website`. Ошибки — под полями; общая ошибка — над кнопкой; кнопка блокируется во время отправки. Успех — «Спасибо! Номер заявки КС-0042. Мы свяжемся с вами в ближайшее время.» Esc и клик по фону закрывают; фокус возвращается на карточку.
- [ ] **Step 2:** `/privacy` — страница-заготовка «Политика обработки персональных данных» с пометкой в коде `// TODO(юрист): заменить текст`.
- [ ] **Step 3: Проверка в браузере** (локально, `.env.local` с тестовым Telegram-чатом владельца — если `TELEGRAM_*` не заданы, `notifyNewOrder` только логирует): отправка валидной заявки → экран «Спасибо» и запись в БД; пустая форма → ошибки у полей; 375px — модалка влезает без горизонтального скролла.
- [ ] **Step 4:** Commit `feat: booking dialog`, push.

---

### Task 8: Вход в админку и каркас

**Files:**
- Create: `src/lib/auth/session.ts`, `src/proxy.ts`, `src/app/admin/login/{page.tsx,actions.ts}`, `src/app/admin/(panel)/{layout.tsx,admin.css,page.tsx}`, `src/components/admin/{AdminShell,Toast}.tsx`, `scripts/hash-password.ts`
- Test: `tests/unit/session.test.ts`, `tests/integration/login.test.ts`

**Interfaces:**
- Produces:
  - `verifyCredentials(login: string, password: string): Promise<boolean>` (сравнение логина за константное время, `bcryptjs.compare`)
  - `signSession(): Promise<string>`, `verifySessionToken(token: string): Promise<boolean>` (`jose`, HS256, `SESSION_SECRET`, exp 30 дней)
  - `SESSION_COOKIE = 'cc_admin'`
  - `requireAdmin(): Promise<void>` — читает cookie, иначе `redirect('/admin/login')`; вызывается в начале **каждого** admin Server Action и в `(panel)/layout.tsx`.
  - `loginAction(prev, formData)` — ключ лимита `login:<ip>`: 5 неудачных за 15 мин → «Слишком много попыток. Подождите 15 минут.»; успех — cookie + `clearRateLimit` + redirect `/admin`. `logoutAction()`.
  - `getDashboard(db?): Promise<{ newOrders: number; upcoming: { sessionId: number; tourTitle: string; startsAt: Date; capacity: number; taken: number }[] }>` (сеансы на 14 дней вперёд, в `src/server/admin-orders.ts`)

- [ ] **Step 1: Failing tests:** токен, подписанный другим секретом или просроченный, не проходит `verifySessionToken`; `verifyCredentials` с неверным паролем — false; 6-я неверная попытка входа с одного IP блокируется даже с правильным паролем; `getDashboard` считает только `new` и только сеансы в ближайшие 14 дней.
- [ ] **Step 2:** FAIL → реализовать → PASS.
- [ ] **Step 3:** `proxy.ts`: для `/admin/:path*`, кроме `/admin/login`, без валидной cookie → redirect на login. `scripts/hash-password.ts` печатает bcrypt-хеш (cost 12). Сгенерировать `SESSION_SECRET` (32 байта), `ADMIN_LOGIN`/`ADMIN_PASSWORD_HASH` — **пароль задаёт владелец**: показать команду `npx tsx scripts/hash-password.ts` и попросить запустить и внести значения через `vercel env add` (в `.env.local` хеш взять в одинарные кавычки — в нём есть `$`).
- [ ] **Step 4:** UI: `AdminShell` — боковое меню (Сводка, Заявки с бейджем числа новых, Экскурсии, Новости, Выйти), < 768px — нижняя панель вкладок; визуальный язык сайта (Prata для заголовков, PT Sans для текста, фон `#fbf6f0`, акцент `#a34a2f`). Сводка: карточка «Новые заявки: N» → `/admin/orders?status=new`; список ближайших сеансов «5 из 8» с полоской → `/admin/sessions/[id]`. `Toast` — показ по query-параметру `?saved=1`. `(panel)/error.tsx` — общий экран «Что-то пошло не так» с кнопкой «Повторить» (детали только в логах).
- [ ] **Step 5: Проверка в браузере:** `/admin` без входа → логин; неверный пароль → ошибка; верный → сводка; выход работает; 375px — нижняя панель.
- [ ] **Step 6:** Commit `feat: admin auth and dashboard`, push.

---

### Task 9: Заявки в админке

**Files:**
- Create: `src/app/admin/(panel)/orders/{page.tsx,[id]/page.tsx,actions.ts}`, `src/components/admin/{StatusBadge,OrderActions}.tsx`
- Modify: `src/server/orders.ts`, `src/server/admin-orders.ts`
- Test: `tests/integration/transition-order.test.ts`, `tests/integration/list-orders.test.ts`

**Interfaces:**
- Produces:
  - `transitionOrder(id: number, to: OrderStatus, db?: Db): Promise<{ ok: true } | { ok: false; error: string }>` — в транзакции: `SELECT … FOR UPDATE` строки сеанса, затем заявки; запрещённый переход → «Нельзя перевести заявку из «X» в «Y»»; при `→confirmed` пересчёт занятых, нехватка → `Свободно ${free}, в заявке ${n} — увеличьте лимит или отмените`.
  - `setAdminNote(id: number, note: string, db?): Promise<void>`
  - `listOrders(f: { status?: OrderStatus | 'all'; tourId?: number; sessionId?: number; q?: string; page?: number }, db?): Promise<{ rows: OrderRow[]; total: number }>` — по 30, новые сверху; `q` ищет по имени (ILIKE) и по цифрам телефона.
  - `getOrder(id: number, db?): Promise<OrderDetail | null>`
  - Server Actions: `changeStatus(id, to)`, `saveNote(id, formData)` — `requireAdmin()`, затем вызов, `revalidatePath('/')` и страниц заявки.

- [ ] **Step 1: Failing tests:**
  - `new→confirmed` при достаточных местах → ok, `free` сеанса уменьшился на состав заявки.
  - подтверждение сверх лимита → ok:false с текстом «Свободно 1, в заявке 3 — увеличьте лимит или отмените», статус остался `new`.
  - `confirmed→cancelled` освобождает места; `done→new` отклоняется.
  - **гонка:** свободно 3, две заявки по 3 подтверждаются через `Promise.all` → ровно одна `ok: true`.
  - `listOrders({status:'new'})` не возвращает подтверждённые; `q:'911123'` находит `+79111234567`; `q:'анна'` находит «Анна».
- [ ] **Step 2:** FAIL → реализовать → PASS.
- [ ] **Step 3: UI.** Список: таблица (номер, создана, экскурсия + сеанс, клиент, состав, сумма, статус), < 768px — карточки; фильтры через query-параметры (статус по умолчанию `new`, экскурсия, сеанс), поиск, пагинация. Карточка заявки: все поля, `tel:` и `mailto:` ссылки, кнопки только для `nextStatuses(status)` («Отменить» — с подтверждением), заметка с сохранением, ссылка на список участников сеанса; ошибка перехода — в баннере над кнопками.
- [ ] **Step 4: Проверка в браузере** полного пути: заявка с сайта → видна в «Новых» → подтверждение → на сайте у сеанса стало меньше мест.
- [ ] **Step 5:** Commit `feat: admin orders`, push.

---

### Task 10: Участники сеанса, печать и CSV

**Files:**
- Create: `src/app/admin/(panel)/sessions/[id]/page.tsx`, `src/app/admin/(panel)/sessions/[id]/csv/route.ts`
- Modify: `src/server/admin-orders.ts`
- Test: `tests/integration/roster.test.ts`, `tests/unit/roster-csv.test.ts`

**Interfaces:**
- Produces: `getSessionRoster(sessionId: number, db?): Promise<{ session: { tourTitle: string; startsAt: Date; capacity: number }; rows: { number: string; name: string; phone: string; children: number; adults: number; total: number; adminNote: string | null }[]; totals: { children: number; adults: number } } | null>` — только `confirmed` и `done`; `rosterToCsv(roster): string` — разделитель `;`, UTF-8 с BOM (чтобы Excel открыл кириллицу), заголовки «Номер;Имя;Телефон;Детей;Взрослых;Сумма;Заметка».

- [ ] **Step 1: Failing tests:** roster не включает `new`/`cancelled`, итоги верны; CSV начинается с `﻿`, поля с `;` или `"` экранированы кавычками.
- [ ] **Step 2:** FAIL → реализовать → PASS.
- [ ] **Step 3:** Страница: заголовок сеанса, «Занято 5 из 8», таблица, кнопки «Печать» (`window.print()`, `@media print` скрывает меню) и «Скачать CSV». Route handler проверяет сессию (`requireAdmin` недоступен в route handler с redirect — вернуть 401 при отсутствии cookie), отдаёт `Content-Disposition: attachment; filename="session-<id>.csv"`.
- [ ] **Step 4:** Commit `feat: session roster with print and CSV`, push.

---

### Task 11: Экскурсии в админке

**Files:**
- Create: `src/lib/validation/tour.ts`, `src/server/tours.ts`, `src/server/upload.ts`, `src/app/admin/(panel)/tours/{page.tsx,new/page.tsx,[id]/page.tsx,actions.ts}`, `src/components/admin/{TourForm,SessionsEditor,ImageDrop}.tsx`
- Modify: `next.config.ts` (`experimental.serverActions.bodySizeLimit: '10mb'`; `images.remotePatterns` для домена Blob)
- Test: `tests/integration/tours.test.ts`

**Interfaces:**
- Consumes: `TicketCard` (превью), `slugify`/`uniqueSlug`, `parseMoscowLocal`/`toMoscowLocalInput`.
- Produces:
  - `saveTour(input: unknown, id?: number, db?): Promise<{ ok: true; id: number } | { ok: false; fieldErrors: Record<string,string> }>` — slug генерируется из названия при создании.
  - `setTourPublished(id, published: boolean, db?)`, `reorderTours(ids: number[], db?)` (sortOrder = индекс).
  - `saveSession(input: { id?: number; tourId: number; startsAt: string; capacity: number; hidden: boolean }, db?): Promise<{ ok: true } | { ok: false; error: string }>` — `capacity` 1..100; нельзя ниже занятых: «Уже подтверждено N человек — лимит не может быть меньше».
  - `deleteSession(id, db?): Promise<{ ok: true } | { ok: false; error: string }>` — с заявками любого статуса → «На сеанс есть заявки — его можно только скрыть».
  - `uploadImage(file: File, folder: 'tours' | 'news'): Promise<string>` — только `image/jpeg|png|webp`, ≤ 8 МБ, иначе ошибка с понятным текстом; `put()` из `@vercel/blob` с `addRandomSuffix: true`.
  - Server Actions-обёртки с `requireAdmin()` и `revalidatePath('/')`.

- [ ] **Step 1: Failing tests:** создание экскурсии без названия → `fieldErrors.title`; `saveSession` с capacity 2 при 3 подтверждённых → ошибка с текстом выше; `deleteSession` с отменённой заявкой → ошибка; без заявок → удалён; `reorderTours([c,a,b])` → порядок в `getPublishedCatalog` c,a,b.
- [ ] **Step 2:** FAIL → реализовать → PASS.
- [ ] **Step 3: UI.** Список: строки с ручкой перетаскивания (`@dnd-kit/sortable`, сохранение порядка по отпусканию), обложка-миниатюра, ближайший сеанс, переключатель «Опубликована». Форма: поля из спеки (описание — `MarkdownEditor` из Task 12, до него — `textarea`), `ImageDrop` (drag-and-drop + клик, превью, ошибка не стирает форму), цены, «главная». `SessionsEditor`: строки «дата-время (`datetime-local`) · лимит · занято N · скрыт · удалить», добавление строки; каждая строка сохраняется своей кнопкой, ошибки — у строки. Справа на ≥ 1100px — живой `TicketCard` в раскрытом виде, обновляется при вводе.
- [ ] **Step 4: Проверка в браузере:** создать экскурсию с фото и сеансом → она на главной; скрыть сеанс → пропал с сайта; снять с публикации → пропала.
- [ ] **Step 5:** Commit `feat: admin tours and sessions`, push.

---

### Task 12: Новости — админка и сайт

**Files:**
- Create: `src/lib/validation/news.ts`, `src/server/news.ts`, `src/app/admin/(panel)/news/{page.tsx,new/page.tsx,[id]/page.tsx,actions.ts}`, `src/components/admin/{NewsForm,MarkdownEditor}.tsx`, `src/components/site/NewsBlock.tsx`, `src/app/(site)/news/page.tsx`, `src/app/(site)/news/[slug]/page.tsx`
- Modify: `src/app/(site)/page.tsx` (блок новостей после каталога), `SiteHeader`/footer (пункт «Новости»), `TourForm` (заменить `textarea` на `MarkdownEditor`)
- Test: `tests/integration/news.test.ts`, `tests/unit/markdown.test.tsx`

**Interfaces:**
- Produces: `saveNews(input: unknown, id?: number, db?)` (slug: из заголовка через `uniqueSlug`, при ручном вводе — `slugify` введённого и проверка уникальности); `setNewsPublished(id, publish: boolean, db?)` (публикация ставит `publishedAt = now()` если пусто; снятие → `null`); `getLatestNews(limit: number, db?)`; `listPublishedNews(page: number, db?)` (по 12); `getNewsBySlug(slug, db?)` (только опубликованные); `listAllNews(db?)` для админки. `Markdown` — общий компонент рендера (`react-markdown` + `remark-gfm`, без `rehype-raw`).

- [ ] **Step 1: Failing tests:** две новости «Ёлка в Эрмитаже» → slug `yolka-v-ermitazhe` и `yolka-v-ermitazhe-2`; черновик не возвращается `getLatestNews`/`getNewsBySlug`; `getLatestNews(3)` — 3 последние по `publishedAt`; рендер Markdown с `<script>alert(1)</script>` и `<img onerror>` не создаёт элементов `script`/`img` с `onerror`.
- [ ] **Step 2:** FAIL → реализовать → PASS.
- [ ] **Step 3: Админка.** Список: заголовок, статус (черновик / опубликована дата), обновлена. Форма: заголовок, slug (автозаполнение до ручной правки), анонс (≤ 300), обложка (`ImageDrop`, folder `news`), `MarkdownEditor` (панель: Ж, К, список, ссылка — вставляют синтаксис вокруг выделения; вкладки «Текст» / «Предпросмотр»), кнопки «Сохранить», «Опубликовать» / «В черновики». Мутации — `revalidatePath('/')`, `/news`, `/news/[slug]`.
- [ ] **Step 4: Сайт.** `NewsBlock` на главной (3 карточки: обложка, дата «4 октября 2026», заголовок, анонс; «Все новости →»; если новостей нет — блок не рендерится) в стилистике секций сайта (kicker «Новости», заголовок Prata). `/news` — сетка с пагинацией. `/news/[slug]` — обложка, дата, текст, «← Все новости», `generateMetadata` с og:title/description/image; 404 для черновика.
- [ ] **Step 5: Проверка в браузере** на 1440px и 375px: публикация новости → появилась на главной и в архиве; снятие → 404 по ссылке.
- [ ] **Step 6:** Commit `feat: news`, push.

---

### Task 13: Продакшен-запуск

**Files:**
- Modify: `README.md` (создать: запуск, тесты, переменные, как сменить пароль, как переехать на другую БД)

- [ ] **Step 1:** Проверить в Vercel все переменные из Global Constraints для Production (`vercel env ls`); `SITE_URL=https://cultural-capital.vercel.app`. Telegram: владелец создаёт бота у @BotFather и даёт токен и chat id через `vercel env add` (показать инструкцию; токен в чат не вставлять).
- [ ] **Step 2:** `npm run test:unit && npm run test:int && npm run build` — всё зелёное.
- [ ] **Step 3:** `npm run db:migrate` и `npm run db:seed` против прод-БД (если ещё не сделано в Task 2/4).
- [ ] **Step 4:** `vercel deploy --prod`.
- [ ] **Step 5: Смоук на проде:** главная совпадает с прежней; старый URL `/mockups/direction-d.html` редиректит; тестовая заявка → сообщение в Telegram → видна в админке → отменить её; публикация и снятие тестовой новости.
- [ ] **Step 6:** Commit `docs: README`, push. Сообщить владельцу: адрес админки, что пароль — тот, что он задал, и что сеансы из сида — прошедшие даты (нужно добавить новые).
