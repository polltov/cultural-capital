CREATE TABLE "site_content" (
	"section" text PRIMARY KEY NOT NULL,
	"content" jsonb NOT NULL,
	"revision" integer NOT NULL
);
