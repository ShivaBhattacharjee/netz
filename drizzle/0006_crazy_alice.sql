CREATE TYPE "public"."eval_status" AS ENUM('queued', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "eval_run" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text NOT NULL,
	"experiment_id" text,
	"label" text NOT NULL,
	"set" text NOT NULL,
	"model" text NOT NULL,
	"prompt" text NOT NULL,
	"prompt_version" text NOT NULL,
	"sample_limit" integer NOT NULL,
	"status" "eval_status" DEFAULT 'queued' NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"done" integer DEFAULT 0 NOT NULL,
	"scores" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"invented_claims" integer DEFAULT 0 NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"cost_micros" bigint DEFAULT 0 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"p50_ms" integer DEFAULT 0 NOT NULL,
	"notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "experiment" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text NOT NULL,
	"name" text NOT NULL,
	"set" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "eval_run" ADD CONSTRAINT "eval_run_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_run" ADD CONSTRAINT "eval_run_experiment_id_experiment_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment" ADD CONSTRAINT "experiment_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eval_run_store_created_idx" ON "eval_run" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "eval_run_experiment_idx" ON "eval_run" USING btree ("experiment_id");--> statement-breakpoint
CREATE INDEX "experiment_store_idx" ON "experiment" USING btree ("store_id");