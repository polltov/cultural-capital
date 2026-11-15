CREATE TABLE "order_refunds" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"refund_id" text,
	"amount" integer NOT NULL,
	"children" integer DEFAULT 0 NOT NULL,
	"adults" integer DEFAULT 0 NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_refunds_amount_check" CHECK ("order_refunds"."amount" >= 0 and "order_refunds"."children" >= 0 and "order_refunds"."adults" >= 0)
);
--> statement-breakpoint
ALTER TABLE "order_refunds" ADD CONSTRAINT "order_refunds_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_refunds_order_idx" ON "order_refunds" USING btree ("order_id");--> statement-breakpoint
-- Возвраты, сделанные до появления истории: по одной записи на заказ (сумма, отменённые билеты, id возврата ЮKassa).
INSERT INTO "order_refunds" ("order_id", "refund_id", "amount", "children", "adults", "source", "created_at")
SELECT "id", "refund_id", "refunded_amount", "children", "adults", 'legacy', "updated_at"
FROM "orders" WHERE "refunded_amount" > 0;
