ALTER TABLE "photo" DROP CONSTRAINT "photo_import_id_import_id_fk";
--> statement-breakpoint
ALTER TABLE "photo" ALTER COLUMN "import_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "photo" ADD CONSTRAINT "photo_import_id_import_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."import"("id") ON DELETE set null ON UPDATE no action;