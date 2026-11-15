CREATE TABLE "customer_login_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_login_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE INDEX "customer_login_tokens_expires_idx" ON "customer_login_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "orders_email_lower_idx" ON "orders" USING btree (lower("email"));