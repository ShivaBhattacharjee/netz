CREATE TYPE "public"."group_status" AS ENUM('pending', 'done', 'needs_review', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('queued', 'processing', 'paused', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."model_route" AS ENUM('cheap', 'strong');--> statement-breakpoint
CREATE TYPE "public"."photo_status" AS ENUM('matched', 'unmatched', 'duplicate', 'invalid');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('ready', 'needs_review', 'approved', 'failed');--> statement-breakpoint
CREATE TYPE "public"."row_status" AS ENUM('pending', 'done', 'needs_review', 'failed');--> statement-breakpoint
CREATE TYPE "public"."translation_origin" AS ENUM('ai', 'manual');--> statement-breakpoint
CREATE TYPE "public"."translation_state" AS ENUM('current', 'out_of_date');--> statement-breakpoint
CREATE TYPE "public"."upload_kind" AS ENUM('sheet', 'zip', 'photo');--> statement-breakpoint
CREATE TABLE "ai_call" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text NOT NULL,
	"import_id" text,
	"product_id" text,
	"group_id" text,
	"task" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micros" bigint DEFAULT 0 NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"ok" boolean NOT NULL,
	"error_code" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_result" (
	"key" text PRIMARY KEY NOT NULL,
	"output" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_group" (
	"id" text PRIMARY KEY NOT NULL,
	"import_id" text NOT NULL,
	"store_id" text NOT NULL,
	"group_key" text NOT NULL,
	"input" jsonb NOT NULL,
	"input_hash" text NOT NULL,
	"route" "model_route" NOT NULL,
	"route_reasons" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" "group_status" DEFAULT 'pending' NOT NULL,
	"reason" text,
	"product_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text NOT NULL,
	"created_by" text,
	"status" "import_status" DEFAULT 'queued' NOT NULL,
	"sheet_upload_id" text NOT NULL,
	"photo_upload_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"file_name" text NOT NULL,
	"file_bytes" bigint NOT NULL,
	"file_sha256" text NOT NULL,
	"default_currency" text NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"counts" jsonb DEFAULT '{"pending":0,"done":0,"needs_review":0,"failed":0}'::jsonb NOT NULL,
	"photo_count" integer DEFAULT 0 NOT NULL,
	"unmatched_photos" text[] DEFAULT '{}'::text[] NOT NULL,
	"error" text,
	"paused_until" timestamp,
	"cost_micros" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "photo" (
	"id" text PRIMARY KEY NOT NULL,
	"import_id" text NOT NULL,
	"store_id" text NOT NULL,
	"file_name" text NOT NULL,
	"sha256" text,
	"storage_key" text,
	"width" integer,
	"height" integer,
	"status" "photo_status" NOT NULL,
	"group_key" text,
	"duplicate_of" text,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "product" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text NOT NULL,
	"group_key" text NOT NULL,
	"handle" text NOT NULL,
	"title" text NOT NULL,
	"description_html" text DEFAULT '' NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"claims" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"seo" jsonb,
	"status" "product_status" NOT NULL,
	"review_reason" text,
	"source_rows" integer[] DEFAULT '{}'::int[] NOT NULL,
	"last_import_id" text,
	"input_hash" text NOT NULL,
	"manual_fields" text[] DEFAULT '{}'::text[] NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_photo" (
	"product_id" text NOT NULL,
	"photo_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "product_photo_product_id_photo_id_pk" PRIMARY KEY("product_id","photo_id")
);
--> statement-breakpoint
CREATE TABLE "source_row" (
	"import_id" text NOT NULL,
	"store_id" text NOT NULL,
	"row_number" integer NOT NULL,
	"cells" jsonb NOT NULL,
	"normalized" jsonb NOT NULL,
	"row_hash" text NOT NULL,
	"group_key" text,
	"status" "row_status" DEFAULT 'pending' NOT NULL,
	"reason" text,
	"product_id" text,
	CONSTRAINT "source_row_import_id_row_number_pk" PRIMARY KEY("import_id","row_number")
);
--> statement-breakpoint
CREATE TABLE "translation" (
	"product_id" text NOT NULL,
	"store_id" text NOT NULL,
	"locale" text NOT NULL,
	"field" text NOT NULL,
	"text" text NOT NULL,
	"origin" "translation_origin" DEFAULT 'ai' NOT NULL,
	"source_hash" text NOT NULL,
	"state" "translation_state" DEFAULT 'current' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "translation_product_id_locale_field_pk" PRIMARY KEY("product_id","locale","field")
);
--> statement-breakpoint
CREATE TABLE "upload" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text NOT NULL,
	"user_id" text,
	"kind" "upload_kind" NOT NULL,
	"file_name" text NOT NULL,
	"bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"mime" text NOT NULL,
	"storage_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "variant" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text NOT NULL,
	"product_id" text NOT NULL,
	"sku" text NOT NULL,
	"options" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"price_cents" integer,
	"currency" text NOT NULL,
	"weight_grams" integer,
	"position" integer DEFAULT 0 NOT NULL,
	"sku_derived" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_call" ADD CONSTRAINT "ai_call_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_group" ADD CONSTRAINT "import_group_import_id_import_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."import"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_group" ADD CONSTRAINT "import_group_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import" ADD CONSTRAINT "import_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import" ADD CONSTRAINT "import_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import" ADD CONSTRAINT "import_sheet_upload_id_upload_id_fk" FOREIGN KEY ("sheet_upload_id") REFERENCES "public"."upload"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo" ADD CONSTRAINT "photo_import_id_import_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."import"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo" ADD CONSTRAINT "photo_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_photo" ADD CONSTRAINT "product_photo_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_photo" ADD CONSTRAINT "product_photo_photo_id_photo_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_row" ADD CONSTRAINT "source_row_import_id_import_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."import"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_row" ADD CONSTRAINT "source_row_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation" ADD CONSTRAINT "translation_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation" ADD CONSTRAINT "translation_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload" ADD CONSTRAINT "upload_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload" ADD CONSTRAINT "upload_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant" ADD CONSTRAINT "variant_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant" ADD CONSTRAINT "variant_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_call_import_idx" ON "ai_call" USING btree ("import_id");--> statement-breakpoint
CREATE INDEX "ai_call_store_created_idx" ON "ai_call" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "import_group_key_uq" ON "import_group" USING btree ("import_id","group_key");--> statement-breakpoint
CREATE INDEX "import_group_status_idx" ON "import_group" USING btree ("import_id","status");--> statement-breakpoint
CREATE INDEX "import_store_created_idx" ON "import" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "import_status_idx" ON "import" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "photo_import_name_uq" ON "photo" USING btree ("import_id","file_name");--> statement-breakpoint
CREATE INDEX "photo_group_idx" ON "photo" USING btree ("import_id","group_key");--> statement-breakpoint
CREATE UNIQUE INDEX "product_store_group_uq" ON "product" USING btree ("store_id","group_key");--> statement-breakpoint
CREATE UNIQUE INDEX "product_store_handle_uq" ON "product" USING btree ("store_id","handle");--> statement-breakpoint
CREATE INDEX "product_store_status_idx" ON "product" USING btree ("store_id","status");--> statement-breakpoint
CREATE INDEX "source_row_status_idx" ON "source_row" USING btree ("import_id","status");--> statement-breakpoint
CREATE INDEX "source_row_group_idx" ON "source_row" USING btree ("import_id","group_key");--> statement-breakpoint
CREATE INDEX "translation_store_locale_idx" ON "translation" USING btree ("store_id","locale");--> statement-breakpoint
CREATE INDEX "upload_store_idx" ON "upload" USING btree ("store_id");--> statement-breakpoint
CREATE UNIQUE INDEX "variant_store_sku_uq" ON "variant" USING btree ("store_id","sku");--> statement-breakpoint
CREATE INDEX "variant_product_idx" ON "variant" USING btree ("product_id");