CREATE TABLE "storico_portale" (
	"id" serial PRIMARY KEY NOT NULL,
	"canale_id" integer NOT NULL,
	"sku_id" integer NOT NULL,
	"azione" text NOT NULL,
	"dettaglio" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "storico_portale" ADD CONSTRAINT "storico_portale_canale_id_canali_id_fk" FOREIGN KEY ("canale_id") REFERENCES "public"."canali"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storico_portale" ADD CONSTRAINT "storico_portale_sku_id_sku_id_fk" FOREIGN KEY ("sku_id") REFERENCES "public"."sku"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "storico_portale_canale_idx" ON "storico_portale" USING btree ("canale_id","created_at");