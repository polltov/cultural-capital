ALTER TABLE "orders" ADD COLUMN "reminder_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "abandoned_mail_sent_at" timestamp with time zone;