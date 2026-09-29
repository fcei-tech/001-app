CREATE TABLE "silenziamenti_errore" (
	"id" serial PRIMARY KEY NOT NULL,
	"sku_id" integer NOT NULL,
	"canale_id" integer NOT NULL,
	"tipo_errore" text NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "silenziamenti_errore" ADD CONSTRAINT "silenziamenti_errore_sku_id_sku_id_fk" FOREIGN KEY ("sku_id") REFERENCES "public"."sku"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "silenziamenti_errore" ADD CONSTRAINT "silenziamenti_errore_canale_id_canali_id_fk" FOREIGN KEY ("canale_id") REFERENCES "public"."canali"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "silenziamenti_sku_canale_idx" ON "silenziamenti_errore" USING btree ("sku_id","canale_id");
