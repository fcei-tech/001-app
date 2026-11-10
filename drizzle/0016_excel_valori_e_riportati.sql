ALTER TABLE "sku" ADD COLUMN "valori_excel" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "sku" ADD COLUMN "riportato_excel_at" timestamp;--> statement-breakpoint
-- Gli sku gia' presenti non vanno nel prossimo "file righe": si considerano gia' riportati.
UPDATE "sku" SET "riportato_excel_at" = now();
