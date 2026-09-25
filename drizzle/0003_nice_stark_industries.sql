ALTER TABLE "batch_pubblicazione" ALTER COLUMN "stato" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "batch_pubblicazione" ALTER COLUMN "stato" SET DEFAULT 'bozza'::text;--> statement-breakpoint
UPDATE "batch_pubblicazione" SET "stato" = 'pubblicato' WHERE "stato" = 'generato';--> statement-breakpoint
DROP TYPE "public"."batch_stato";--> statement-breakpoint
CREATE TYPE "public"."batch_stato" AS ENUM('bozza', 'confermato', 'pubblicato');--> statement-breakpoint
ALTER TABLE "batch_pubblicazione" ALTER COLUMN "stato" SET DEFAULT 'bozza'::"public"."batch_stato";--> statement-breakpoint
ALTER TABLE "batch_pubblicazione" ALTER COLUMN "stato" SET DATA TYPE "public"."batch_stato" USING "stato"::"public"."batch_stato";--> statement-breakpoint
ALTER TABLE "batch_lotti" ADD COLUMN "consegnato_at" timestamp;--> statement-breakpoint
ALTER TABLE "batch_lotti" ADD COLUMN "consegna_dettagli" jsonb;
