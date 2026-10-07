CREATE TABLE "blocco_sku_canale" (
	"sku_id" integer NOT NULL,
	"canale_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "blocco_sku_canale_sku_id_canale_id_pk" PRIMARY KEY("sku_id","canale_id")
);
--> statement-breakpoint
CREATE TABLE "esposizione_canale" (
	"sku_id" integer NOT NULL,
	"canale_id" integer NOT NULL,
	"quantita_caricata" integer DEFAULT 0 NOT NULL,
	"aggiornato_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "esposizione_canale_sku_id_canale_id_pk" PRIMARY KEY("sku_id","canale_id")
);
--> statement-breakpoint
ALTER TABLE "blocco_sku_canale" ADD CONSTRAINT "blocco_sku_canale_sku_id_sku_id_fk" FOREIGN KEY ("sku_id") REFERENCES "public"."sku"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocco_sku_canale" ADD CONSTRAINT "blocco_sku_canale_canale_id_canali_id_fk" FOREIGN KEY ("canale_id") REFERENCES "public"."canali"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esposizione_canale" ADD CONSTRAINT "esposizione_canale_sku_id_sku_id_fk" FOREIGN KEY ("sku_id") REFERENCES "public"."sku"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esposizione_canale" ADD CONSTRAINT "esposizione_canale_canale_id_canali_id_fk" FOREIGN KEY ("canale_id") REFERENCES "public"."canali"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
UPDATE "canali" SET "attivo" = false WHERE "nome" = 'Etsy';--> statement-breakpoint
UPDATE "canali" SET "impostazioni" = COALESCE("impostazioni", '{}'::jsonb) || '{"quantitaFissa": 1}'::jsonb WHERE "nome" = 'Subito';
