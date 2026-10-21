ALTER TABLE "import" ADD COLUMN "estimate_micros" bigint;--> statement-breakpoint
ALTER TABLE "import" ADD COLUMN "budget_micros" bigint;--> statement-breakpoint
ALTER TABLE "variant" ADD COLUMN "missing_since" text;