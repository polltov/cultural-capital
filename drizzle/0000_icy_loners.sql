CREATE TYPE "public"."order_status" AS ENUM('new', 'confirmed', 'done', 'cancelled');--> statement-breakpoint
CREATE TABLE "news" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"excerpt" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"cover_url" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "news_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"number" serial NOT NULL,
	"session_id" integer NOT NULL,
	"customer_name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"comment" text DEFAULT '' NOT NULL,
	"children" integer DEFAULT 0 NOT NULL,
	"adults" integer DEFAULT 0 NOT NULL,
	"price_child_snapshot" integer NOT NULL,
	"price_adult_snapshot" integer NOT NULL,
	"total" integer NOT NULL,
	"status" "order_status" DEFAULT 'new' NOT NULL,
	"admin_note" text DEFAULT '' NOT NULL,
	"consent_at" timestamp with time zone NOT NULL,
	"payment_status" text,
	"payment_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_number_unique" UNIQUE("number"),
	CONSTRAINT "orders_participants_check" CHECK ("orders"."children" >= 0 and "orders"."adults" >= 0 and "orders"."children" + "orders"."adults" >= 1)
);
--> statement-breakpoint
CREATE TABLE "rate_limit_hits" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tour_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tour_id" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"capacity" integer DEFAULT 8 NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tours" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"subtitle" text DEFAULT '' NOT NULL,
	"route" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"duration_label" text NOT NULL,
	"age_label" text NOT NULL,
	"cover_url" text,
	"price_child" integer NOT NULL,
	"price_adult" integer NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tours_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_session_id_tour_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."tour_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tour_sessions" ADD CONSTRAINT "tour_sessions_tour_id_tours_id_fk" FOREIGN KEY ("tour_id") REFERENCES "public"."tours"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "news_published_at_idx" ON "news" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "orders_status_created_idx" ON "orders" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "orders_session_idx" ON "orders" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "rate_limit_hits_key_created_idx" ON "rate_limit_hits" USING btree ("key","created_at");--> statement-breakpoint
CREATE INDEX "tour_sessions_tour_starts_idx" ON "tour_sessions" USING btree ("tour_id","starts_at");