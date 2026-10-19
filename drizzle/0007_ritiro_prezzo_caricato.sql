ALTER TABLE "blocco_sku_canale" ADD COLUMN "motivo" text DEFAULT 'blocco' NOT NULL;--> statement-breakpoint
ALTER TABLE "esposizione_canale" ADD COLUMN "prezzo_caricato" numeric(10, 2);