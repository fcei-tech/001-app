CREATE TABLE "impostazioni_app" (
	"chiave" text PRIMARY KEY NOT NULL,
	"valore" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sku" ADD COLUMN "prezzo_shopify" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "sku" ADD COLUMN "prezzo_subito" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "sku" ADD COLUMN "prezzo_bidspirit" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "sku" ADD COLUMN "riserva_bidspirit" numeric(10, 2);