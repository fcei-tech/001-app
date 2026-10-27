CREATE TABLE "file_portale" (
	"canale_id" integer PRIMARY KEY NOT NULL,
	"creato_at" timestamp DEFAULT now() NOT NULL,
	"nome_file" text NOT NULL,
	"righe" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "override_portale" (
	"sku_id" integer NOT NULL,
	"canale_id" integer NOT NULL,
	"quantita" integer,
	"condizione" text,
	"descrizione" text,
	"modificato_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "override_portale_sku_id_canale_id_pk" PRIMARY KEY("sku_id","canale_id")
);
--> statement-breakpoint
ALTER TABLE "esposizione_canale" ADD COLUMN "in_vetrina" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "esposizione_canale" ADD COLUMN "id_portale" text;--> statement-breakpoint
ALTER TABLE "file_portale" ADD CONSTRAINT "file_portale_canale_id_canali_id_fk" FOREIGN KEY ("canale_id") REFERENCES "public"."canali"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "override_portale" ADD CONSTRAINT "override_portale_sku_id_sku_id_fk" FOREIGN KEY ("sku_id") REFERENCES "public"."sku"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "override_portale" ADD CONSTRAINT "override_portale_canale_id_canali_id_fk" FOREIGN KEY ("canale_id") REFERENCES "public"."canali"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
UPDATE "esposizione_canale" SET "in_vetrina" = true WHERE "quantita_caricata" > 0;
