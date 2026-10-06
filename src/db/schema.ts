import { sql } from "drizzle-orm";
import {
  boolean, check, index, integer, jsonb, pgEnum, pgTable, serial, text, timestamp, uniqueIndex,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const orderStatus = pgEnum("order_status", [
  "new", "confirmed", "done", "cancelled", "awaiting_payment", "paid", "expired",
]);

export const tours = pgTable("tours", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  subtitle: text("subtitle").notNull().default(""),
  route: text("route").notNull().default(""),
  description: text("description").notNull().default(""),
  note: text("note").notNull().default(""),
  meetingPoint: text("meeting_point").notNull().default(""),
  whatToBring: text("what_to_bring").notNull().default(""),
  durationLabel: text("duration_label").notNull(),
  ageLabel: text("age_label").notNull(),
  coverUrl: text("cover_url"),
  priceChild: integer("price_child").notNull(),
  priceAdult: integer("price_adult").notNull(),
  featured: boolean("featured").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  published: boolean("published").notNull().default(false),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const tourSessions = pgTable(
  "tour_sessions",
  {
    id: serial("id").primaryKey(),
    tourId: integer("tour_id").notNull().references(() => tours.id, { onDelete: "cascade" }),
    startsAt: ts("starts_at").notNull(),
    capacity: integer("capacity").notNull().default(8),
    hidden: boolean("hidden").notNull().default(false),
  },
  (t) => [index("tour_sessions_tour_starts_idx").on(t.tourId, t.startsAt)],
);

export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    number: serial("number").notNull().unique(),
    sessionId: integer("session_id").notNull().references(() => tourSessions.id, { onDelete: "restrict" }),
    customerName: text("customer_name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    comment: text("comment").notNull().default(""),
    children: integer("children").notNull().default(0),
    adults: integer("adults").notNull().default(0),
    priceChildSnapshot: integer("price_child_snapshot").notNull(),
    priceAdultSnapshot: integer("price_adult_snapshot").notNull(),
    total: integer("total").notNull(),
    status: orderStatus("status").notNull().default("new"),
    adminNote: text("admin_note").notNull().default(""),
    consentAt: ts("consent_at").notNull(),
    paymentStatus: text("payment_status"),
    paymentId: text("payment_id"),
    accessToken: text("access_token").unique(),
    holdExpiresAt: ts("hold_expires_at"),
    paidAt: ts("paid_at"),
    refundId: text("refund_id"),
    refundedAmount: integer("refunded_amount").notNull().default(0),
    ticketSentAt: ts("ticket_sent_at"),
    closingReceiptAt: ts("closing_receipt_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("orders_participants_check", sql`${t.children} >= 0 and ${t.adults} >= 0 and ${t.children} + ${t.adults} >= 1`),
    index("orders_status_created_idx").on(t.status, t.createdAt),
    index("orders_session_idx").on(t.sessionId),
    uniqueIndex("orders_payment_id_idx").on(t.paymentId),
  ],
);

export const paymentEvents = pgTable(
  "payment_events",
  {
    id: serial("id").primaryKey(),
    receivedAt: ts("received_at").notNull().defaultNow(),
    source: text("source").notNull(),
    event: text("event").notNull(),
    paymentId: text("payment_id").notNull(),
    orderId: integer("order_id").references(() => orders.id, { onDelete: "set null" }),
    payload: jsonb("payload").notNull(),
    note: text("note").notNull().default(""),
  },
  (t) => [index("payment_events_payment_id_idx").on(t.paymentId)],
);

export const news = pgTable(
  "news",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    excerpt: text("excerpt").notNull().default(""),
    body: text("body").notNull().default(""),
    coverUrl: text("cover_url"),
    publishedAt: ts("published_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("news_published_at_idx").on(t.publishedAt)],
);

export const faqItems = pgTable("faq_items", {
  id: serial("id").primaryKey(),
  question: text("question").notNull(),
  answer: text("answer").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  published: boolean("published").notNull().default(true),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const rateLimitHits = pgTable(
  "rate_limit_hits",
  {
    id: serial("id").primaryKey(),
    key: text("key").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("rate_limit_hits_key_created_idx").on(t.key, t.createdAt)],
);
