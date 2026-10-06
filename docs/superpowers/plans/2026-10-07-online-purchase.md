# Онлайн-покупка экскурсий — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Клиент выбирает экскурсию, дату и билеты, платит во встроенном виджете ЮKassa и получает билет на сайте и на почту, а кассовый чек — от ЮKassa; админ возвращает деньги и переносит заказы кнопкой.

**Architecture:** Заказ создаётся в статусе «ждёт оплаты» с удержанием мест на 15 минут под блокировкой сеанса; платёж ЮKassa (`confirmation.type = "embedded"`) несёт данные чека 54-ФЗ. Единственная функция `syncPayment` меняет статус заказа по данным, перезапрошенным из API ЮKassa (вызывается из webhook, страницы заказа и ночной задачи); побочные эффекты (письмо через Resend, Telegram) выполняются после коммита через `after()`.

**Tech Stack:** Next.js 16 (App Router, Server Actions, Route Handlers), TypeScript, Drizzle ORM + Postgres, zod 4, Vitest (+ jsdom, Testing Library), ЮKassa API v3 и Resend REST API через `fetch` (без SDK), Vercel Cron.

**Spec:** `docs/superpowers/specs/2026-10-07-online-purchase-design.md`

## Global Constraints

- Ветка `feature/online-purchase` от актуального `main`. **Не мержить в `main` и не деплоить на прод** до задачи 18 (нужны боевые ключи ЮKassa, домен и DNS Resend). Исключение — задача 1 (оферта), она идёт в `main` и на прод сразу.
- Next.js 16 отличается от привычного: перед кодом Route Handler'ов, `after()` и `metadata` прочитать `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`, `…/03-api-reference/03-file-conventions/route.md`, `…/03-api-reference/04-functions/after.md`, `…/03-api-reference/04-functions/generate-metadata.md`.
- Провайдеры — только через `fetch`, никаких npm-SDK ЮKassa/Resend.
- Деньги в БД — целые рубли; в API ЮKassa — строка с двумя знаками (`"1700.00"`), валюта `"RUB"`.
- Даты/время для людей — только через `src/lib/domain/moscow-time.ts` (Europe/Moscow).
- Весь текст интерфейса и писем — на русском; суммы через `formatRub`.
- `HOLD_MINUTES = 15`; лимит попыток оплаты — 10 с IP в час (ключ `checkout:<ip>`); токен страницы заказа — 32 случайных байта в base64url (43 символа).
- Ставка НДС — `YOOKASSA_VAT_CODE` (по умолчанию `1`); закрывающий чек — только при `RECEIPT_CLOSING=on` (по умолчанию выключен).
- Таймауты внешних вызовов: ЮKassa и Resend — 10 с (`AbortSignal.timeout(10_000)`), Telegram — 5 с (как сейчас).
- Согласие на обработку ПДн — отдельный чекбокс со ссылкой на `/consent` (требование 152-ФЗ, коммит `3d42d76`); оферта принимается нажатием кнопки оплаты, а не тем же чекбоксом (уточнение спеки).
- Тесты: `npm run test:unit`, `npm run test:int` (Postgres из `docker compose -f docker-compose.test.yml up -d`), `npx tsc --noEmit`, `npm run lint`, `npm run build` — перед каждым коммитом задачи проходят те, что относятся к задаче; в конце каждой задачи — все.
- Каждый коммит заканчивается строкой `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Двойное нажатие «Перейти к оплате»** — должен уйти один запрос и создаться один заказ (тест в задаче 12).
2. **Админ меняет цену экскурсии, пока клиент платит** — заказ всё равно становится «оплачен»: сверка идёт со слепком `total`, а не с текущей ценой (тест в задаче 9).
3. **Админ уменьшает лимит сеанса, пока чьи-то места удержаны** — сохранение отклоняется, удержание считается занятым местом (тест в задаче 4).
4. **Клиент много раз открывает страницу заказа из письма** — для оплаченного заказа нет обращения к ЮKassa и повторных писем (тест в задаче 11).
5. **Уведомление ЮKassa приходит раньше, чем у заказа сохранён `payment_id`** — заказ находится по `metadata.order_id` и всё равно становится «оплачен» (тест в задаче 9).

---

### Task 1: Страница оферты (в `main`, на прод сразу)

**Files:**
- Create: `src/app/(site)/offer/page.tsx`
- Modify: `src/components/site/StaticSections.tsx` (футер, `nav aria-label="Документы"`)
- Test: `tests/unit/offer-page.test.tsx`

**Interfaces:**
- Consumes: `LegalPage` (`src/components/site/LegalPage.tsx`), `operator`, `or`, `ogrnLabel`, `LEGAL_EDITION` из `src/lib/legal.ts`.
- Produces: маршрут `/offer`.

- [ ] **Step 1: Тест**

```tsx
// @vitest-environment jsdom
it("offer lists cancellation rule and operator placeholders", () => {
  render(<OfferPage />);
  expect(screen.getByRole("heading", { name: "Договор-оферта на оказание экскурсионных услуг" })).toBeTruthy();
  expect(screen.getByText(/не позднее чем за 24 часа/)).toBeTruthy();
  expect(screen.getByText(/50%/)).toBeTruthy();
  expect(screen.getAllByText(/\[не заполнено\]/).length).toBeGreaterThan(0); // пустые реквизиты видны
});
it("footer links to offer", () => { render(<Footer />); expect(screen.getByRole("link", { name: "Договор-оферта" }).getAttribute("href")).toBe("/offer"); });
```

- [ ] **Step 2:** `npm run test:unit -- offer-page` → FAIL (модуль не найден).
- [ ] **Step 3: Страница.** `export const metadata = { title: "Договор-оферта — Культурная Столица" }`, комментарий `// TODO(юрист): проверить текст`. Разделы `h2`: 1. Общие положения (акцепт — оплата заказа на сайте); 2. Предмет (экскурсия в группе по выбранной дате и времени); 3. Стоимость и оплата (цены в карточке на момент заказа, 100% предоплата онлайн через ЮKassa, кассовый чек на email); 4. Билет (приходит на email, страница заказа по ссылке); 5. Отмена и возврат — «при отмене не позднее чем за 24 часа до начала — возврат 100%, позже — 50%; для отмены свяжитесь с нами»; 6. Перенос (по договорённости на другой сеанс той же экскурсии, в т. ч. из-за погоды); 7. Ответственность и порядок разрешения споров (кратко); 8. Реквизиты исполнителя — `or(operator.name)`, ИНН, `ogrnLabel` + ОГРН, адрес, email, телефон. Редакция — `LEGAL_EDITION`. Ссылка «Договор-оферта» в футере первой в `nav aria-label="Документы"`.
- [ ] **Step 4:** `npm run test:unit -- offer-page` → PASS; `npm run lint && npx tsc --noEmit && npm run build` → без ошибок.
- [ ] **Step 5: Коммит в `main`, push, `vercel deploy --prod --yes`** (по правилу авто-пуша проекта).

```bash
git add src/app/\(site\)/offer src/components/site/StaticSections.tsx tests/unit/offer-page.test.tsx
git commit -m "feat: public offer page"
```

- [ ] **Step 6:** Создать ветку для остальных задач: `git switch -c feature/online-purchase`.

---

### Task 2: Статусы, удержание мест, правило возврата

**Files:**
- Modify: `src/lib/domain/order-status.ts`, `src/lib/domain/seats.ts`
- Create: `src/lib/domain/refund-policy.ts`
- Test: `tests/unit/order-status.test.ts` (переписать), `tests/unit/refund-policy.test.ts`, `tests/unit/seats.test.ts` (дополнить)

**Interfaces:**
- Produces:
  - `ORDER_STATUSES = ["new","confirmed","done","cancelled","awaiting_payment","paid","expired"] as const`, `type OrderStatus`.
  - `STATUS_LABELS`: `new` «Новая заявка», `confirmed` «Заявка подтверждена», `done` «Проведён», `cancelled` «Отменён», `awaiting_payment` «Ждёт оплаты», `paid` «Оплачен», `expired` «Не оплачен».
  - `nextStatuses(from)` / `canTransition(from, to)` — **только ручные переходы админа**: `new → confirmed | cancelled`, `confirmed → done | cancelled`, `paid → done`; остальные — `[]`. Отмена оплаченного — только через `refundOrder` (задача 13), системные переходы — в `syncPayment`/`releaseHold`/ночной задаче.
  - `SEAT_HOLDING_STATUSES = ["confirmed", "done", "paid"] as const` (удержание `awaiting_payment` учитывается отдельно в SQL, задача 4); `HOLD_MINUTES = 15`.
  - `defaultRefundAmount(total: number, startsAt: Date, now: Date): number`.

- [ ] **Step 1: Тесты**

```ts
expect(nextStatuses("paid")).toEqual(["done"]);
expect(canTransition("paid", "cancelled")).toBe(false);
expect(nextStatuses("awaiting_payment")).toEqual([]);
expect(nextStatuses("new")).toEqual(["confirmed", "cancelled"]);
expect(STATUS_LABELS.expired).toBe("Не оплачен");
const start = new Date("2026-10-12T08:00:00Z");
expect(defaultRefundAmount(3270, start, new Date("2026-10-11T08:00:00Z"))).toBe(3270); // ровно 24 ч
expect(defaultRefundAmount(3270, start, new Date("2026-10-11T08:00:01Z"))).toBe(1635);
expect(defaultRefundAmount(3271, start, new Date("2026-10-12T09:00:00Z"))).toBe(1636); // после начала, округление вверх
expect(HOLD_MINUTES).toBe(15);
```

- [ ] **Step 2:** `npm run test:unit -- order-status refund-policy seats` → FAIL.
- [ ] **Step 3:** Реализовать; `defaultRefundAmount`: `startsAt - now >= 24 ч` → `total`, иначе `Math.ceil(total / 2)`.
- [ ] **Step 4:** тесты → PASS; `npx tsc --noEmit` покажет места, где старые подписи статусов используются (`OrderActions` BUTTONS и т. п.) — добавить в `BUTTONS` записи для новых статусов (`paid`: не используется, `done`: «Отметить проведённым»), чтобы типы сошлись; полноценная переделка — задача 14.
- [ ] **Step 5: Коммит** `feat: order statuses for online payment, refund policy`.

---

### Task 3: Позиции чека и суммы для API

**Files:**
- Create: `src/lib/domain/receipt.ts`
- Modify: `src/lib/domain/pricing.ts` (+`toApiAmount`), `src/lib/domain/moscow-time.ts` (+`formatDateNumeric`, `formatDayMonthNumeric`)
- Test: `tests/unit/receipt.test.ts`, `tests/unit/pricing.test.ts`, `tests/unit/moscow-time.test.ts`

**Interfaces:**
- Produces:
  - `toApiAmount(rub: number): string` — `1700 → "1700.00"`.
  - `formatDateNumeric(d: Date): string` — `"12.10.2026"`; `formatDayMonthNumeric(d)` — `"12.10"` (МСК).
  - `type ReceiptItem = { description: string; quantity: number; amount: { value: string; currency: "RUB" }; vat_code: number; payment_subject: "service"; payment_mode: "full_prepayment" | "full_payment" }`
  - `type ReceiptOrder = { tourTitle: string; startsAt: Date; children: number; adults: number; priceChild: number; priceAdult: number }`
  - `paymentItems(o: ReceiptOrder, vatCode: number, mode: "full_prepayment" | "full_payment"): ReceiptItem[]` — по позиции на тип билета с ненулевым количеством, `amount` — цена за штуку.
  - `refundItems(o: { tourTitle: string; startsAt: Date }, amount: number, vatCode: number): ReceiptItem[]` — одна позиция `Возврат: Экскурсия «…», 12.10.2026 11:00`, `quantity: 1`, `payment_mode: "full_prepayment"`.
  - `paymentDescription(number: string, tourTitle: string, startsAt: Date): string` — `КС-0057 · <название> · 12.10 11:00`, ≤ 128.
  - Все описания ≤ 128 символов: обрезается **название** (с «…»), хвост («, детский билет», дата) сохраняется.

- [ ] **Step 1: Тесты**

```ts
const o = { tourTitle: "Эрмитаж", startsAt: new Date("2026-10-12T08:00:00Z"), children: 2, adults: 1, priceChild: 1000, priceAdult: 1270 };
const items = paymentItems(o, 1, "full_prepayment");
expect(items.map((i) => i.description)).toEqual([
  "Экскурсия «Эрмитаж», 12.10.2026 11:00, детский билет",
  "Экскурсия «Эрмитаж», 12.10.2026 11:00, взрослый билет",
]);
expect(items.reduce((s, i) => s + Number(i.amount.value) * i.quantity, 0)).toBe(3270);
expect(paymentItems({ ...o, children: 0 }, 1, "full_payment")).toHaveLength(1);
const long = paymentItems({ ...o, tourTitle: "Я".repeat(200) }, 1, "full_prepayment")[0].description;
expect(long.length).toBeLessThanOrEqual(128);
expect(long.endsWith("11:00, детский билет")).toBe(true);
expect(refundItems(o, 1635, 4)[0]).toMatchObject({ quantity: 1, amount: { value: "1635.00", currency: "RUB" }, vat_code: 4 });
expect(paymentDescription("КС-0057", "Эрмитаж", o.startsAt)).toBe("КС-0057 · Эрмитаж · 12.10 11:00");
expect(toApiAmount(1700)).toBe("1700.00");
```

- [ ] **Step 2:** `npm run test:unit -- receipt pricing moscow-time` → FAIL.
- [ ] **Step 3:** Реализовать.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: Коммит** `feat: receipt items for 54-FZ`.

---

### Task 4: Схема БД и подсчёт мест с удержанием

**Files:**
- Modify: `src/db/schema.ts`, `src/server/seats-sql.ts`, `tests/integration/setup.ts` (TRUNCATE + `payment_events`)
- Create: `drizzle/0003_*.sql` (через `npm run db:generate`)
- Test: `tests/integration/seats-hold.test.ts`

**Interfaces:**
- Produces (Drizzle-поля, camelCase ↔ snake_case):
  - `tours`: `meetingPoint` (`meeting_point` text not null default `''`), `whatToBring` (`what_to_bring` text not null default `''`).
  - `orders`: `accessToken` (`access_token` text unique, nullable), `holdExpiresAt`, `paidAt`, `refundId` (text), `refundedAmount` (`refunded_amount` int not null default 0), `ticketSentAt`, `closingReceiptAt`; уникальный индекс `orders_payment_id_idx` на `payment_id`.
  - enum `order_status` + `awaiting_payment`, `paid`, `expired` (порядок как в `ORDER_STATUSES`).
  - `paymentEvents` (`payment_events`): `id` serial, `receivedAt` (default now), `source` text not null, `event` text not null, `paymentId` text not null, `orderId` int nullable → orders (`on delete set null`), `payload` jsonb not null, `note` text not null default `''`; индекс по `payment_id`.
  - `seatsTakenSql()` — сумма участников, где `status in SEAT_HOLDING_STATUSES` **или** `status = 'awaiting_payment' and hold_expires_at > now()`.

- [ ] **Step 1: Тесты** (`seats-hold.test.ts`; хелпер вставки тура/сеанса как в `create-order.test.ts`)

```ts
it("active hold takes seats, expired hold does not", async () => {
  // capacity 8; заказ awaiting_payment на 3 с hold_expires_at = now+10 мин; второй — на 2 с hold_expires_at = now-1 мин
  expect((await getPublishedCatalog(db))[0].sessions[0].free).toBe(5);
  expect(await occupiedSeats(db, s.id)).toBe(3);
});
it("paid takes seats, expired/cancelled do not", async () => { /* paid 2, expired 3, cancelled 1 → free 6 */ });
it("cannot lower capacity below paid + active holds", async () => {
  // paid 3 + hold 2 → saveSession({ id, tourId, startsAt, capacity: 4, hidden: false }) → ok:false
  expect(r.ok).toBe(false);
});
it("roster lists paid orders, not holds", async () => {
  // paid «Анна» 2+1, awaiting_payment с активным удержанием «Борис» → getSessionRoster: одна строка «Анна», totals { children: 2, adults: 1 }
});
```

- [ ] **Step 2:** `npm run test:int -- seats-hold` → FAIL.
- [ ] **Step 3:** Изменить схему, `npm run db:generate`; проверить в сгенерированном SQL `ALTER TYPE "public"."order_status" ADD VALUE …` (три строки) и что существующие строки не трогаются. Обновить `seatsTakenSql` и TRUNCATE в `setup.ts`.
- [ ] **Step 4:** `npm run test:int` → весь набор PASS (в т. ч. `schema.test.ts`, `catalog.test.ts`, `roster.test.ts`).
- [ ] **Step 5: Коммит** `feat: schema for online payments and seat holds`.

---

### Task 5: Место встречи и «что взять» в форме экскурсии

**Files:**
- Modify: `src/lib/validation/tour.ts`, `src/server/tours.ts` (`saveTour`, `getAdminTour`), `src/components/admin/TourForm.tsx`
- Test: `tests/integration/tours.test.ts`, `tests/unit/tour-form-sessions.test.tsx` (если ломаются дефолты формы)

**Interfaces:**
- Produces: `tourSchema.meetingPoint = text("Место встречи", 300).default("")`, `tourSchema.whatToBring = text("Что взять с собой", 500).default("")`; поля сохраняются и возвращаются `getAdminTour`.

- [ ] **Step 1: Тест** `saveTour` с `meetingPoint: "Дворцовая пл., у Александровской колонны"`, `whatToBring: "Удобная обувь"` → в БД; повтор с длиной 301 → `fieldErrors.meetingPoint === "Не длиннее 300 символов"`.
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3:** Реализовать; в `TourForm` — два `textarea` (rows 2 и 3) с подписями «Место встречи» и «Что взять с собой» после «Примечания».
- [ ] **Step 4:** → PASS (unit + int).
- [ ] **Step 5: Коммит** `feat: tour meeting point and what to bring`.

---

### Task 6: Клиент ЮKassa

**Files:**
- Create: `src/server/payments/types.ts`, `src/server/payments/yookassa.ts`, `src/server/payments/gateway.ts`, `tests/support/fake-gateway.ts`
- Test: `tests/unit/yookassa.test.ts`

**Interfaces:**
- Consumes: `ReceiptItem`, `toApiAmount` (задача 3).
- Produces:

```ts
export type PaymentStatus = "pending" | "waiting_for_capture" | "succeeded" | "canceled";
export type GatewayPayment = { id: string; status: PaymentStatus; amount: { value: string; currency: string }; metadata: Record<string, string>; confirmationToken: string | null };
export type CreatePaymentInput = { idempotenceKey: string; amount: number; description: string; orderId: number; customer: { email: string; phone: string; fullName: string }; items: ReceiptItem[] };
export type GatewayRefund = { id: string; status: "pending" | "succeeded" | "canceled" };
export type CreateRefundInput = { idempotenceKey: string; paymentId: string; amount: number; customerEmail: string; items: ReceiptItem[] };
export type CreateReceiptInput = { idempotenceKey: string; paymentId: string; customerEmail: string; items: ReceiptItem[]; prepaymentAmount: number };
export interface PaymentGateway {
  createPayment(i: CreatePaymentInput): Promise<GatewayPayment>;
  getPayment(id: string): Promise<GatewayPayment>;
  createRefund(i: CreateRefundInput): Promise<GatewayRefund>;
  createReceipt(i: CreateReceiptInput): Promise<void>;
}
export class PaymentGatewayError extends Error { constructor(message: string, readonly status?: number) }
// yookassa.ts
export function yookassaGateway(cfg: { shopId: string; secretKey: string; fetchImpl?: typeof fetch }): PaymentGateway;
// gateway.ts — из env
export function paymentGateway(): PaymentGateway;      // бросает Error("ЮKassa не настроена"), если нет YOOKASSA_SHOP_ID/SECRET_KEY
export function vatCode(): number;                     // YOOKASSA_VAT_CODE, по умолчанию 1
export function closingReceiptsEnabled(): boolean;     // RECEIPT_CLOSING === "on"
// tests/support/fake-gateway.ts
export function fakeGateway(): PaymentGateway & {
  payments: Map<string, GatewayPayment>; refunds: CreateRefundInput[]; receipts: CreateReceiptInput[];
  setStatus(id: string, s: PaymentStatus): void; failNext(m: keyof PaymentGateway, err?: Error): void;
};
```

- [ ] **Step 1: Тесты** (stub `fetchImpl`, записывающий запросы):
  - `createPayment` → `POST https://api.yookassa.ru/v3/payments`, заголовки `Authorization: Basic base64("shop:secret")`, `Idempotence-Key`, `Content-Type: application/json`; тело содержит `amount: { value: "3270.00", currency: "RUB" }`, `capture: true`, `confirmation: { type: "embedded" }`, `metadata: { order_id: "7" }`, `receipt.customer: { email, phone, full_name }`, `receipt.items`; ответ `confirmation.confirmation_token: "ct-1"` → `confirmationToken === "ct-1"`.
  - `getPayment("p1")` → `GET …/payments/p1`.
  - `createRefund` → `POST …/refunds`, тело `{ payment_id, amount: { value: "1635.00", currency: "RUB" }, receipt: { customer: { email }, items } }`.
  - `createReceipt` → `POST …/receipts`, тело `{ type: "payment", payment_id, send: true, customer: { email }, items, settlements: [{ type: "prepayment", amount: { value, currency } }] }`.
  - ответ 400 `{ description: "Invalid email" }` → `PaymentGatewayError` с `message === "Invalid email"` и `status === 400`.
- [ ] **Step 2:** `npm run test:unit -- yookassa` → FAIL.
- [ ] **Step 3:** Реализовать (`AbortSignal.timeout(10_000)`; сетевую ошибку/таймаут оборачивать в `PaymentGatewayError` без `status`). Подделку сделать по тому же интерфейсу: `createPayment` создаёт `pending` с id `pay-<n>` и `confirmationToken: "ct-<n>"`.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: Коммит** `feat: YooKassa API client`.

---

### Task 7: Письма (Resend) и данные билета

**Files:**
- Create: `src/server/mail/send.ts`, `src/server/mail/templates.ts`, `src/server/ticket.ts`
- Test: `tests/unit/mail-templates.test.ts`, `tests/unit/mail-send.test.ts`, `tests/integration/ticket.test.ts`

**Interfaces:**
- Produces:

```ts
// send.ts — POST https://api.resend.com/emails, Bearer RESEND_API_KEY, from MAIL_FROM
export async function sendMail(m: { to: string; subject: string; html: string; text: string }, fetchImpl?: typeof fetch): Promise<boolean>; // false: не настроено (warn) или ошибка (error в лог)
// templates.ts
export type TicketData = { orderId: number; number: string; tourTitle: string; startsAt: Date; meetingPoint: string; whatToBring: string;
  children: number; adults: number; total: number; name: string; email: string; url: string };
export function ticketEmail(t: TicketData, kind: "paid" | "moved"): { subject: string; html: string; text: string };
export function cancelledEmail(t: TicketData, refunded: number): { subject: string; html: string; text: string };
export function sorryEmail(t: TicketData): { subject: string; html: string; text: string };
// ticket.ts
export async function loadTicket(orderId: number, db?: Db): Promise<TicketData | null>; // url = `${SITE_URL}/order/${accessToken}`
export async function sendTicket(orderId: number, kind: "paid" | "moved", db?: Db): Promise<boolean>; // при успехе ставит ticket_sent_at
export async function sendCancelled(orderId: number, db?: Db): Promise<boolean>;
export async function sendSorry(orderId: number, db?: Db): Promise<boolean>;
```

- Темы: `Ваш билет КС-0057 — <экскурсия>`, `Билет КС-0057 перенесён`, `Заказ КС-0057 отменён`, `Извините, места закончились — заказ КС-0057`.

- [ ] **Step 1: Тесты**
  - `ticketEmail(t, "paid")`: тема как выше; `html` содержит `t.url`, «Кассовый чек придёт отдельным письмом от ЮKassa», место встречи, «2 детских + 1 взрослый», `formatRub(3270)`; имя `<b>x</b>` выводится экранированным (`&lt;b&gt;`); пустое `whatToBring` — блок «Что взять с собой» отсутствует.
  - `cancelledEmail(t, 1635)` содержит `formatRub(1635)`; при `0` — «Заказ отменён без возврата».
  - `sendMail`: без `RESEND_API_KEY` → `false` без вызова fetch; ответ 500 → `false`; 200 → `true`, тело `{ from: MAIL_FROM, to: [to], subject, html, text }`.
  - `sendTicket` (int, `vi.mock("@/server/mail/send")` → `true`): ставит `ticket_sent_at`; при `false` — не ставит.
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3:** Реализовать: инлайн-стили в цветах сайта (`#fbf6f0` фон, `#22293a` текст, `#a34a2f` акцент), экранирование всех подставляемых строк, текстовая версия.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: Коммит** `feat: ticket emails via Resend`.

---

### Task 8: Начало оплаты и снятие удержания

**Files:**
- Create: `src/lib/validation/checkout.ts`, `src/server/checkout.ts`
- Test: `tests/integration/checkout.test.ts`

**Interfaces:**
- Consumes: `fakeGateway`/`PaymentGateway`, `paymentGateway()`, `vatCode()`, `paymentItems`, `paymentDescription`, `seatsTakenSql`/`occupiedSeats`, `hitRateLimit`, `HOLD_MINUTES`.
- Produces:

```ts
// checkout.ts (validation) — поля bookingSchema без comment; email обязателен: «Укажите email» / «Проверьте email»
export const checkoutSchema: z.ZodType<...>;
export type CheckoutResult =
  | { ok: true; orderToken: string; confirmationToken: string; holdExpiresAt: string /* ISO */ }
  | { ok: false; error?: string; fieldErrors?: Partial<Record<string, string>> };
// server/checkout.ts
export async function startCheckout(input: unknown, ip: string, deps?: { db?: Db; gateway?: PaymentGateway }): Promise<CheckoutResult>;
export async function releaseHold(orderToken: string, db?: Db): Promise<void>; // awaiting_payment → expired; иначе ничего
```

- Тексты ошибок (дословно): «Слишком много попыток. Попробуйте позже или позвоните нам.», «Этот сеанс недоступен для покупки», «Осталось мест: N», «Мест не осталось», «Оплата временно недоступна. Попробуйте позже или позвоните нам.»
- Порядок: валидация → honeypot (`{ ok: false }`, без записи) → лимит → транзакция (`select … from tour_sessions where id = $1 for update`, проверки, insert с `status: "awaiting_payment"`, `holdExpiresAt = now + 15 мин`, `accessToken`) → `createPayment` (`idempotenceKey = accessToken`, `customer.fullName = name`) → update `paymentId`, `paymentStatus`. Ошибка шлюза → заказ `expired`, ошибка в лог.

- [ ] **Step 1: Тесты** (prices 1000/1270, capacity 8):
  - успех: `ok: true`, `orderToken` длиной 43, `confirmationToken: "ct-1"`; в БД `awaiting_payment`, `total 3270`, `paymentId "pay-1"`, `email` сохранён; свободно 5; запрос в шлюз — сумма 3270, 2 позиции чека, `metadata.order_id`;
  - email пустой → `fieldErrors.email === "Укажите email"`; `"abc"` → «Проверьте email»;
  - мест 2, просим 3 → «Осталось мест: 2»; мест 0 → «Мест не осталось»;
  - прошедший / скрытый / неопубликованный → «Этот сеанс недоступен для покупки»;
  - две параллельные покупки 3 мест при свободных 4 (`Promise.all`) → ровно одна `ok`, вторая «Осталось мест: 1»;
  - `failNext("createPayment")` → «Оплата временно недоступна…», заказ `expired`, свободно 8;
  - 11-я валидная попытка с IP за час → «Слишком много попыток…»; невалидные не тратят лимит;
  - `releaseHold(token)` → `expired`, свободно 8; для `paid` — без изменений.
- [ ] **Step 2:** `npm run test:int -- checkout` → FAIL.
- [ ] **Step 3:** Реализовать (`randomBytes(32).toString("base64url")`).
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: Коммит** `feat: start checkout with seat hold`.

---

### Task 9: Подтверждение оплаты, журнал, Telegram

**Files:**
- Create: `src/server/payment-sync.ts`
- Modify: `src/server/telegram.ts` (`notifyNewOrder` → `notifyPaidOrder`, + `notifyAlert`)
- Test: `tests/integration/payment-sync.test.ts`, `tests/unit/telegram.test.ts`

**Interfaces:**
- Consumes: `PaymentGateway`, `refundItems`, `vatCode()`, `sendTicket`, `sendSorry`.
- Produces:

```ts
export type SyncOutcome = { kind: "paid" | "late_paid" | "late_refunded" | "expired" | "mismatch" | "noop" | "unknown"; orderId?: number };
export async function syncPayment(paymentId: string, source: "webhook" | "sync" | "cron", deps?: { db?: Db; gateway?: PaymentGateway }): Promise<SyncOutcome>;
export async function runSyncEffects(o: SyncOutcome): Promise<void>;
// telegram.ts
export function buildPaidOrderMessage(o: { number: string; tourTitle: string; startsAt: Date; children: number; adults: number; total: number; name: string; phone: string; adminUrl: string }): string; // первая строка: <b>Оплачен заказ КС-0057 · 3 270 ₽</b>
export async function notifyPaidOrder(orderId: number, db?: Db): Promise<void>;
export async function notifyAlert(text: string): Promise<void>; // префикс «⚠️ »
```

- Алгоритм (спека, «Подтверждение»): `getPayment` → заказ по `metadata.order_id`; если `orders.payment_id` не null и ≠ `paymentId` → `unknown`; если null — записать `paymentId`. Журнал `payment_events` (payload — объект платежа, `note` — `kind`). Транзакция: блокировка сеанса → заказа. `succeeded`: сумма/валюта ≠ `toApiAmount(total)`/`RUB` → `mismatch`; `awaiting_payment` → `paid` (`paidAt`) — **без проверки мест и времени удержания**; `expired` → места есть → `paid` (`late_paid`), нет → `createRefund` (`idempotenceKey: late-refund-<id>`, сумма `total`) → `cancelled`, `refundedAmount = total`, `refundId` (`late_refunded`); `paid`/`done`/`cancelled` → `noop`. `canceled`: `awaiting_payment` → `expired`, иначе `noop`. `pending` → обновить `paymentStatus`, `noop`.
- `runSyncEffects`: `paid`/`late_paid` → `sendTicket(id, "paid")` + `notifyPaidOrder(id)`; `late_refunded` → `sendSorry(id)` + `notifyAlert("Поздняя оплата КС-…: мест нет, оформлен автовозврат")`; `mismatch` → `notifyAlert("Сумма платежа не совпала с заказом КС-…")`.

- [ ] **Step 1: Тесты** (fake gateway; заказ создаётся через `startCheckout`):
  - `setStatus("pay-1","succeeded")` → `{ kind: "paid" }`, заказ `paid`, `paidAt` задан, 1 запись в журнале; повтор → `noop`, журнал 2 записи;
  - **(Review Focus 2)** после `startCheckout` админ меняет `tours.price_child` на 5000 → `syncPayment` → `paid`;
  - **(Review Focus 5)** `payment_id` заказа обнулён вручную до синка → заказ найден по `metadata.order_id`, `paid`, `payment_id` записан;
  - платёж на другую сумму → `mismatch`, статус `awaiting_payment`;
  - `canceled` → `expired`;
  - поздняя оплата при свободных местах (`releaseHold`, затем `succeeded`) → `late_paid`, `paid`;
  - поздняя оплата без мест (после `releaseHold` другой заказ занял все места) → `late_refunded`, `cancelled`, `refundedAmount === total`, в шлюзе один возврат на полную сумму;
  - `runSyncEffects({ kind: "paid", orderId })` вызывает `sendTicket` и `notifyPaidOrder` (vi.mock модулей).
  - unit: `buildPaidOrderMessage` — первая строка `<b>Оплачен заказ КС-0057 · 3 270 ₽</b>`, экранирование имени.
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3:** Реализовать; удалить `notifyNewOrder`/`buildOrderMessage` вместе с их тестами.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: Коммит** `feat: payment confirmation sync`.

---

### Task 10: Приём уведомлений ЮKassa

**Files:**
- Create: `src/app/api/payments/yookassa/route.ts`
- Test: `tests/unit/yookassa-webhook.test.ts`

**Interfaces:**
- Consumes: `syncPayment`, `runSyncEffects`, `after` из `next/server`.
- Produces: `export async function POST(req: Request): Promise<Response>`.

- [ ] **Step 1: Тесты** (`vi.mock("@/server/payment-sync")`, `vi.mock("next/server", …)` с `after: (fn) => fn()`):
  - тело не JSON или без `object.id` → 400;
  - `{ event: "payment.succeeded", object: { id: "p1" } }` → `syncPayment("p1", "webhook")`, 200, `runSyncEffects` вызван с результатом;
  - `syncPayment` бросает → 500;
  - `refund.succeeded` → `syncPayment` не вызывается, запись в журнал (`payment_events` с `event: "refund.succeeded"`, `paymentId = object.payment_id`), 200.
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3:** Реализовать (прочитать доку route handlers и `after` — см. Global Constraints).
- [ ] **Step 4:** → PASS; `npm run build` — роут собирается как динамический.
- [ ] **Step 5: Коммит** `feat: YooKassa webhook endpoint`.

---

### Task 11: Страница заказа и билет

**Files:**
- Create: `src/server/order-page.ts`, `src/app/(site)/order/[token]/page.tsx`, `src/components/site/TicketView.tsx`, `src/components/site/AwaitPayment.tsx`
- Modify: `src/app/(site)/site.css` (стили билета + `@media print`)
- Test: `tests/integration/order-page.test.ts`, `tests/unit/ticket-view.test.tsx`

**Interfaces:**
- Consumes: `loadTicket`, `syncPayment`, `runSyncEffects`.
- Produces:

```ts
export type OrderView = "awaiting" | "paid" | "expired" | "cancelled";
export type OrderPageData = { view: OrderView; ticket: TicketData; refunded: number };
export async function loadOrderPage(token: string, deps?: { db?: Db; gateway?: PaymentGateway }): Promise<{ data: OrderPageData; outcome: SyncOutcome | null } | null>;
// TicketView: ({ ticket, refunded, view }: OrderPageData) => JSX — «paid» (и done) = билет; AwaitPayment — client, router.refresh() каждые 3 с, 20 раз
```

- Токен не `^[A-Za-z0-9_-]{43}$` или не найден → `null` → `notFound()`. `done` → `view: "paid"`. Синк с ЮKassa — только для `awaiting_payment` с `paymentId`. Страница: `metadata.robots = { index: false, follow: false }`, эффекты синка — `after(() => runSyncEffects(outcome))`.
- Тексты состояний — из спеки («Проверяем оплату…», «Оплата ещё обрабатывается — билет придёт на почту, как только банк подтвердит платёж», «Время на оплату истекло», «Заказ отменён», «возврат N ₽ оформлен», «Кассовый чек отправлен на email отдельным письмом от ЮKassa»).

- [ ] **Step 1: Тесты**
  - int: `awaiting_payment` + в шлюзе `succeeded` → `view: "paid"`, `outcome.kind === "paid"`;
  - int **(Review Focus 4)**: для `paid` заказа `loadOrderPage` трижды → `gateway.getPayment` не вызван ни разу, `outcome === null`;
  - int: мусорный токен и несуществующий → `null`;
  - unit (jsdom): `TicketView` с `view: "paid"` показывает «КС-0057», место встречи, «2 детских + 1 взрослый», кнопку «Распечатать» и строку про чек; `view: "cancelled", refunded: 1635` → «возврат 1 635 ₽ оформлен»; `view: "expired"` → ссылка «Выбрать дату заново» на `/#catalog`.
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3:** Реализовать; билет — в стиле карточки (`ticket.css`: перфорация, «№ КС-0057» на корешке); `@media print` скрывает шапку/подвал/кнопку.
- [ ] **Step 4:** → PASS; `npm run build`.
- [ ] **Step 5: Коммит** `feat: order page with ticket`.

---

### Task 12: Модалка покупки с виджетом

**Files:**
- Create: `src/components/site/CheckoutDialog.tsx`, `src/components/site/PaymentWidget.tsx`
- Modify: `src/app/(site)/actions.ts`, `src/components/site/Catalog.tsx`, `src/components/site/TicketCard.tsx` (кнопка «Купить билет»), `src/app/(site)/site.css`
- Delete: `src/components/site/BookingDialog.tsx`, `src/lib/validation/booking.ts`, `createOrder` из `src/server/orders.ts`, `tests/unit/booking-dialog.test.tsx`, `tests/integration/create-order.test.ts`
- Test: `tests/unit/checkout-dialog.test.tsx`, `tests/unit/ticket-card.test.tsx`

**Interfaces:**
- Consumes: `startCheckout`, `releaseHold`, `CheckoutResult`.
- Produces:

```ts
// actions.ts
export async function startCheckoutAction(_prev: CheckoutResult | null, formData: FormData): Promise<CheckoutResult>;
export async function releaseHoldAction(orderToken: string): Promise<void>;
// CheckoutDialog — те же props, что были у BookingDialog: { tour, sessions, initialSessionId, onClose }
// PaymentWidget
export function PaymentWidget(p: { confirmationToken: string; returnUrl: string; onError: () => void }): JSX.Element; // грузит https://yookassa.ru/checkout-widget/v1/checkout-widget.js один раз, new window.YooMoneyCheckoutWidget({ confirmation_token, return_url, customization: { colors: { control_primary: "#a34a2f" } }, error_callback }).render("payment-form"); destroy() при размонтировании
```

- Шаги: «Дата» (чипы, «мест нет» неактивны, предвыбор `initialSessionId`) → «Билеты» (счётчики, итог, «Назад»/«Далее») → «Оплата» (сводка «<экскурсия> · 12 окт, сб, 11:00 · 2 детских + 1 взрослый · 3 270 ₽», имя, телефон с маской, email с подписью «сюда придут билет и чек», отдельный чекбокс согласия — **текущая формулировка** со ссылками `/consent` и `/privacy`, honeypot, кнопка «Перейти к оплате · 3 270 ₽», под ней «Нажимая кнопку, вы принимаете условия <a href="/offer">договора-оферты</a>»). После `ok` — поля только для чтения, таймер «Места за вами ещё 14:59» (от `holdExpiresAt`), «← Изменить», `PaymentWidget` (`returnUrl = location.origin + "/order/" + orderToken`). Таймер 0 → виджет убирается, «Время на оплату истекло», кнопка «Начать заново» (→ `releaseHoldAction`, шаг «Оплата» с введёнными данными). Ошибка виджета → «Не удалось загрузить форму оплаты» + «Попробовать снова» (`releaseHoldAction` и повторная отправка). Ошибки «Осталось мест: N» / «Мест не осталось» переводят на шаг «Билеты» и показываются там (каталог обновляется через `router.refresh()`). Поля контролируемые и не теряются при ошибках (как в старой модалке — React 19 сбрасывает `<form action>`).

- [ ] **Step 1: Тесты** (jsdom; `vi.mock("@/app/(site)/actions")`; `window.YooMoneyCheckoutWidget` — заглушка-класс с `render`/`destroy`; скрипт-загрузчик замокан):
  - распроданный сеанс — радио `disabled`; «Далее» на шаге «Дата» неактивна без выбора;
  - счётчики: сумма не больше `free`; итог «3 270 ₽» для 2+1 при 1000/1270;
  - на шаге «Оплата» есть ссылки `/consent`, `/privacy`, `/offer`;
  - ответ `fieldErrors.email` → ошибка у поля, введённые имя/телефон сохранены;
  - **(Review Focus 1)** два быстрых клика «Перейти к оплате» → `startCheckoutAction` вызван 1 раз;
  - ответ `ok` → есть `#payment-form`, заглушка виджета получила `confirmation_token` и `return_url` с `/order/<token>`, текст «Места за вами ещё»;
  - `vi.useFakeTimers()`, прокрутка до `holdExpiresAt` → «Время на оплату истекло», `destroy` вызван;
  - «← Изменить» → `releaseHoldAction(token)`, поля снова редактируемы;
  - ответ `{ ok: false, error: "Осталось мест: 2" }` → активен шаг «Билеты», текст ошибки виден;
  - `TicketCard`: кнопка называется «Купить билет».
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3:** Реализовать; удалить старый поток заявок (файлы из «Delete»); `Catalog` рендерит `CheckoutDialog`. `npx tsc --noEmit` не должен находить ссылок на удалённое.
- [ ] **Step 4:** `npm run test:unit && npm run test:int && npm run build` → PASS.
- [ ] **Step 5: Коммит** `feat: checkout dialog with YooKassa widget`.

---

### Task 13: Возврат, перенос, повторная отправка (сервер)

**Files:**
- Create: `src/server/refunds.ts`
- Test: `tests/integration/refunds.test.ts`

**Interfaces:**
- Consumes: `PaymentGateway`, `refundItems`, `vatCode()`, `defaultRefundAmount`.
- Produces:

```ts
export type ActionResult = { ok: true } | { ok: false; error: string };
export async function refundOrder(orderId: number, amount: number, deps?: { db?: Db; gateway?: PaymentGateway }): Promise<ActionResult>;
export async function moveOrder(orderId: number, targetSessionId: number, db?: Db): Promise<ActionResult>;
export async function listMoveTargets(orderId: number, db?: Db): Promise<{ id: number; startsAt: Date; free: number }[]>; // будущие нескрытые сеансы той же экскурсии, кроме текущего, free ≥ участников
```

- `refundOrder`: блокировка заказа; не `paid` → «Вернуть деньги можно только по оплаченному заказу»; `amount` не целое или вне `0…total` → «Сумма возврата — от 0 до <formatRub(total)>»; `amount > 0` → `createRefund({ idempotenceKey: "refund-<id>", … })`; ошибка шлюза → «Возврат не прошёл: <message>», заказ не меняется; успех → `cancelled`, `refundedAmount`, `refundId`. `amount = 0` → `cancelled` без вызова шлюза.
- `moveOrder`: блокировки сеансов по возрастанию `id`, затем заказа; не `paid` → «Перенести можно только оплаченный заказ»; сеанс другой экскурсии / прошедший / скрытый → «Этот сеанс недоступен для переноса»; мест мало → «В выбранном сеансе свободно N, в заказе M».

- [ ] **Step 1: Тесты:** возврат 1635 → один вызов шлюза с суммой 1635 и ключом `refund-<id>`, статус `cancelled`, места освободились; повторный вызов → ошибка «Вернуть деньги можно только…», шлюз не вызван второй раз; `failNext("createRefund")` → «Возврат не прошёл: …», статус `paid`; сумма 4000 при `total` 3270 → ошибка суммы; `0` → `cancelled`, шлюз не вызывался; перенос успешный → `sessionId` изменён, места пересчитаны в обоих сеансах; перенос в полный сеанс → «В выбранном сеансе свободно 1, в заказе 3»; `listMoveTargets` не содержит текущий, прошедший, скрытый и чужой сеанс.
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3:** Реализовать.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: Коммит** `feat: refund and move paid orders`.

---

### Task 14: Админка заказов

**Files:**
- Modify: `src/app/admin/(panel)/orders/actions.ts`, `src/app/admin/(panel)/orders/[id]/page.tsx`, `src/app/admin/(panel)/orders/page.tsx`, `src/components/admin/OrderActions.tsx`, `src/components/admin/AdminShell.tsx`, `src/app/admin/(panel)/page.tsx`, `src/server/admin-orders.ts`, `src/app/admin/(panel)/admin.css`
- Test: `tests/unit/order-actions.test.tsx`, `tests/integration/list-orders.test.ts`, `tests/integration/dashboard.test.ts`

**Interfaces:**
- Consumes: `refundOrder`, `moveOrder`, `listMoveTargets`, `sendTicket`, `sendCancelled`, `defaultRefundAmount`, `transitionOrder` (для `paid → done`).
- Produces:

```ts
// actions.ts (все с requireAdmin(), revalidateAll(id), эффекты писем через after())
export async function refundAction(id: number, amount: number): Promise<ActionResult>;      // after: sendCancelled
export async function moveAction(id: number, sessionId: number): Promise<ActionResult>;     // after: sendTicket(id, "moved")
export async function resendTicketAction(id: number): Promise<ActionResult>;                // «Письмо не отправлено — проверьте настройки почты»
// admin-orders.ts
export type Dashboard = { paid7d: { count: number; sum: number }; upcoming: DashboardSession[] }; // заказы paid/done с paid_at за последние 7 дней; sum — по total
OrderDetail += { paymentId: string | null; paymentStatus: string | null; paidAt: Date | null; refundedAmount: number; ticketSentAt: Date | null; accessToken: string | null };
```

- Меню «Заявки» → «Заказы», заголовки страниц «Заказы» / «Заказ КС-0057». Фильтр статуса по умолчанию — `paid`; пустой список: «Оплаченных заказов нет.». CSS-бейджи для `awaiting_payment`, `paid`, `expired`.
- Карточка: блок «Оплата» (ID платежа, сумма, «Оплачен <дата, время>», «Возвращено N ₽» если >0, «Билет отправлен <время>» / «Билет не отправлен», ссылка «Открыть страницу клиента» → `/order/<token>` в новой вкладке). Кнопки для `paid`: «Отменить и вернуть» (диалог: поле суммы с `defaultRefundAmount(total, startsAt, new Date())`, подсказка «По правилу: за 24 ч и раньше — 100%, позже — 50%», «Вернуть N ₽»), «Перенести» (select из `listMoveTargets`, «Перенести»), «Отметить проведённым», «Отправить билет повторно» (и для `done`). Старые заявки — прежние кнопки.
- Сводка: карточка «Оплачено за 7 дней»: «N заказов · <formatRub(sum)>», ссылка на `/admin/orders?status=paid`.

- [ ] **Step 1: Тесты:** `OrderActions` для `paid` показывает 4 кнопки; диалог возврата подставляет 3270 при старте через 48 ч и 1635 через 2 ч; отправка вызывает `refundAction(id, 1635)` (mock); для `awaiting_payment` и `expired` кнопок нет; `getDashboard` считает `paid7d` по `paid_at` (заказ 8 дней назад не входит, `cancelled` не входит).
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3:** Реализовать.
- [ ] **Step 4:** → PASS; `npm run build`.
- [ ] **Step 5: Коммит** `feat: admin orders with payments, refunds and moves`.

---

### Task 15: Ночная задача

**Files:**
- Create: `src/server/nightly.ts`, `src/app/api/cron/nightly/route.ts`
- Modify: `vercel.ts` (`crons: [{ path: "/api/cron/nightly", schedule: "0 0 * * *" }]`)
- Test: `tests/integration/nightly.test.ts`, `tests/unit/cron-route.test.ts`

**Interfaces:**
- Consumes: `syncPayment`, `runSyncEffects`, `paymentItems`, `PaymentGateway.createReceipt`, `closingReceiptsEnabled()`, `vatCode()`.
- Produces:

```ts
export type NightlyReport = { synced: number; expired: number; closed: number; done: number; errors: number };
export async function runNightly(deps?: { db?: Db; gateway?: PaymentGateway; now?: Date; closing?: boolean }): Promise<NightlyReport>;
export async function GET(req: Request): Promise<Response>; // 401 без `Authorization: Bearer ${CRON_SECRET}`; 200 + JSON отчёта
```

- Шаг 1: `awaiting_payment` с `hold_expires_at < now` и `payment_id` → `syncPayment(id, "cron")` (+ `runSyncEffects`); оставшиеся `awaiting_payment` с истёкшим удержанием → `expired`. Шаг 2: `paid`/`done` с `payment_id`, `closing_receipt_at is null`, `starts_at < now − 3 ч` → при `closing` — `createReceipt({ idempotenceKey: "closing-<id>", items: paymentItems(…, "full_payment"), prepaymentAmount: total })` и `closing_receipt_at`; затем `paid → done`. Ошибка по заказу → `errors++`, остальные обрабатываются.

- [ ] **Step 1: Тесты:** истёкшее удержание с `succeeded` в шлюзе → `paid` (synced 1); без оплаты → `expired`; прошедший `paid` при `closing: true` → 1 чек с `settlements` 3270 и `payment_mode: "full_payment"`, `done`, `closing_receipt_at`; при `closing: false` → чека нет, `done`, `closing_receipt_at` пуст; `done`, отмеченный админом вручную, при `closing: true` получает чек; заказ без `payment_id` (старая заявка) не трогается; `failNext("createReceipt")` → `errors: 1`, заказ остаётся `paid`, следующий обработан; роут: без заголовка → 401, с верным → 200.
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3:** Реализовать.
- [ ] **Step 4:** → PASS; `npm run build`.
- [ ] **Step 5: Коммит** `feat: nightly payments maintenance cron`.

---

### Task 16: Тексты сайта, документы ПДн, окружение

**Files:**
- Modify: `src/components/site/StaticSections.tsx` (`Route`: шаги 1–2), `src/app/(site)/consent/page.tsx`, `src/app/(site)/privacy/page.tsx`, `.env.example`, `README.md`
- Create: `drizzle/0004_faq_payment_texts.sql` через `npx drizzle-kit generate --custom --name faq_payment_texts` (создаёт файл, запись в журнале и снимок)
- Test: `tests/unit/faq-migration.test.ts`, `tests/unit/route-section.test.tsx`

**Interfaces:**
- Produces: тексты из спеки (раздел «Публичный сайт»).

- [ ] **Step 1: Тесты:** `faq-migration.test.ts` читает `drizzle/0004_faq_payment_texts.sql` и проверяет: ровно 3 `UPDATE "faq_items"`; в каждом есть `WHERE "question" = '…' AND "answer" = '<старый ответ из 0002 дословно>'` (ответы, изменённые владельцем в админке, не перезаписываются); новые ответы содержат «картой, по СБП, SberPay или T-Pay», «напишите нам, подберём вариант», «напишите или позвоните нам». (Интеграционный тест не подходит: `setup.ts` очищает `faq_items` перед каждым тестом.) `route-section.test.tsx`: блок `Route` содержит «Покупаете билет онлайн» и «Получаете билет на почту».
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3:** Реализовать:
  - `0004`: два `UPDATE "faq_items" SET "answer" = '<новый>' WHERE "question" = '<вопрос>' AND "answer" = '<старый дословно из 0002>'`; вопрос про индивидуальные экскурсии — заменить «по запросу через форму или в личном сообщении» на «по запросу — напишите или позвоните нам» тем же способом.
  - `/consent` и `/privacy`: цель — «оформление и оплата заказа, отправка билета и кассового чека, связь по заказу, проведение экскурсии»; перечень данных — без комментария, email обязателен; получатели — добавить «НКО «ЮМани» (ООО), сервис ЮKassa (Россия) — приём оплаты и формирование кассового чека» и «Resend, Inc. (США) — отправка писем с билетом» (трансграничная передача), Telegram — «уведомление администратора об оплаченном заказе». Обновить `LEGAL_EDITION` на дату запуска при мерже (задача 18).
  - `.env.example` и таблица README: `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY`, `YOOKASSA_VAT_CODE`, `RECEIPT_CLOSING`, `RESEND_API_KEY`, `MAIL_FROM`, `CRON_SECRET`; раздел README «Онлайн-оплата»: тестовый магазин, URL уведомлений `https://<домен>/api/payments/yookassa` и события `payment.succeeded`, `payment.canceled`, `refund.succeeded`, ночная задача.
- [ ] **Step 4:** `npm run test:unit && npm run test:int && npm run lint && npx tsc --noEmit && npm run build` → PASS.
- [ ] **Step 5: Коммит** `feat: site copy and PD documents for online payment`.

---

### Task 17: Превью с тестовым магазином и проверка в браузере

Нужно от владельца: ключи **тестового магазина ЮKassa**; согласие на подключение Resend через Vercel Marketplace и на отдельную ветку базы Neon для превью.

- [ ] **Step 1: Отдельная база для превью.** Создать ветку Neon `preview-online-purchase` от прод-ветки (навык `neon-postgres`), прогнать `DATABASE_URL=<ветка> npm run db:migrate`. Задать `DATABASE_URL` для окружения Preview **только для git-ветки** `feature/online-purchase` (`vercel env add DATABASE_URL preview feature/online-purchase`). Превью не должно писать в прод-базу.
- [ ] **Step 2: Resend.** `vercel integration add resend/resend-email` (с подтверждением владельца; если нужен браузер — `vercel integration open resend/resend-email`). Для превью `MAIL_FROM=Культурная Столица <onboarding@resend.dev>` (Resend доставляет такие письма только на email владельца аккаунта — для проверки достаточно).
- [ ] **Step 3: Переменные превью:** `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY` (тестовые, sensitive), `YOOKASSA_VAT_CODE=1`, `RECEIPT_CLOSING=off`, `CRON_SECRET`, `SITE_URL` = URL превью ветки.
- [ ] **Step 4: Деплой превью** `vercel deploy` (без `--prod`). Защита превью Vercel блокирует внешние запросы: в кабинете тестового магазина URL уведомлений указать с обходом защиты (`…/api/payments/yookassa?x-vercel-protection-bypass=<секрет>`; секрет — Protection Bypass for Automation в настройках проекта) — уточнить в доке Vercel, навык `vercel:access-protected-vercel-deployment`.
- [ ] **Step 5: Проверка в браузере** (десктоп и 375 px): каталог → «Купить билет» → дата → билеты → оплата тестовой картой → страница заказа «Проверяем оплату…» → билет; письмо с билетом пришло; в кабинете ЮKassa — платёж и чек «Предоплата 100%»; оплата тестовым СБП; таймер и «← Изменить» (места вернулись в каталоге); истечение 15 минут; ошибка оплаты тестовой картой с отказом; в админке — «Оплачено за 7 дней», карточка заказа, возврат 50% (чек возврата в кабинете, письмо об отмене), перенос (письмо с новой датой), «Отправить билет повторно»; печать билета; список участников сеанса; `curl -H "Authorization: Bearer $CRON_SECRET" <превью>/api/cron/nightly` → JSON отчёта.
- [ ] **Step 6:** Записать найденные проблемы и исправить их отдельными коммитами (каждое — с тестом); повторить шаг 5 для затронутых мест.
- [ ] **Step 7:** Финальное ревью всей ветки (`superpowers:requesting-code-review`), исправления.

---

### Task 18: Запуск (только когда владелец готов)

Условия: боевой магазин ЮKassa одобрен и подключены «Чеки от ЮKassa»; домен привязан к Vercel и подтверждён в Resend; реквизиты в `src/lib/legal.ts` заполнены; бухгалтер ответил про `YOOKASSA_VAT_CODE` и `RECEIPT_CLOSING`.

- [ ] **Step 1:** Прод-переменные: `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY`, `YOOKASSA_VAT_CODE`, `RECEIPT_CLOSING`, `MAIL_FROM=Культурная Столица <tickets@<домен>>`, `CRON_SECRET`, `SITE_URL=https://<домен>`.
- [ ] **Step 2:** В боевом кабинете ЮKassa — URL уведомлений `https://<домен>/api/payments/yookassa`, события `payment.succeeded`, `payment.canceled`, `refund.succeeded`.
- [ ] **Step 3:** `DATABASE_URL=<прод> npm run db:migrate` (миграции только добавляют; сид не запускать).
- [ ] **Step 4:** `LEGAL_EDITION` = дата запуска; мерж `feature/online-purchase` в `main`, push, `vercel deploy --prod --yes`.
- [ ] **Step 5:** Боевая покупка на минимальную сумму (тестовая экскурсия со скрытым сеансом и ценой 10 ₽ — или реальная) → билет, письмо, чек; возврат из админки → чек возврата. Удалить тестовый сеанс.
- [ ] **Step 6:** Удалить ветку Neon превью и превью-переменные.
