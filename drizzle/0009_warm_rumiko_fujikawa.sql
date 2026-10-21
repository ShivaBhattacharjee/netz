CREATE TABLE "eval_set" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text NOT NULL,
	"name" text NOT NULL,
	"sheet_upload_id" text NOT NULL,
	"labels_key" text NOT NULL,
	"products" integer NOT NULL,
	"rows" integer NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "eval_run" ADD COLUMN "set_id" text;--> statement-breakpoint
ALTER TABLE "experiment" ADD COLUMN "set_id" text;--> statement-breakpoint
ALTER TABLE "eval_set" ADD CONSTRAINT "eval_set_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_set" ADD CONSTRAINT "eval_set_sheet_upload_id_upload_id_fk" FOREIGN KEY ("sheet_upload_id") REFERENCES "public"."upload"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_set" ADD CONSTRAINT "eval_set_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "eval_set_store_name_uq" ON "eval_set" USING btree ("store_id","name");--> statement-breakpoint
ALTER TABLE "eval_run" ADD CONSTRAINT "eval_run_set_id_eval_set_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."eval_set"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment" ADD CONSTRAINT "experiment_set_id_eval_set_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."eval_set"("id") ON DELETE set null ON UPDATE no action;