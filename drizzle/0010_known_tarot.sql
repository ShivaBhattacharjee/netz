ALTER TABLE "import" ADD COLUMN "photo_match" text;--> statement-breakpoint
ALTER TABLE "photo" ADD COLUMN "suggested_group_key" text;--> statement-breakpoint
ALTER TABLE "photo" ADD COLUMN "suggestion_confidence" integer;--> statement-breakpoint
ALTER TABLE "photo" ADD COLUMN "ai_checked_at" timestamp;