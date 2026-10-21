CREATE TYPE "public"."store_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TABLE "store" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"domain" text,
	"default_currency" text DEFAULT 'EUR' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "store_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "store_member" (
	"store_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "store_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "store_member_store_id_user_id_pk" PRIMARY KEY("store_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "store_member" ADD CONSTRAINT "store_member_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_member" ADD CONSTRAINT "store_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "store_member_user_id_idx" ON "store_member" USING btree ("user_id");