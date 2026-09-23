CREATE TYPE "public"."batch_stato" AS ENUM('bozza', 'confermato', 'generato');--> statement-breakpoint
CREATE TYPE "public"."canale_tipo" AS ENUM('statico', 'asta_online', 'asta_fisica');--> statement-breakpoint
CREATE TYPE "public"."lotto_stato" AS ENUM('attivo', 'candidato', 'accettato');--> statement-breakpoint
CREATE TABLE "batch_lotti" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_id" integer NOT NULL,
	"sku_id" integer NOT NULL,
	"stato_riga" "lotto_stato" DEFAULT 'attivo' NOT NULL,
	"override" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "batch_pubblicazione" (
	"id" serial PRIMARY KEY NOT NULL,
	"canale_id" integer NOT NULL,
	"stato" "batch_stato" DEFAULT 'bozza' NOT NULL,
	"impostazioni_batch" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"snapshot" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"confermato_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canali" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"tipo" "canale_tipo" NOT NULL,
	"esclusivo" boolean DEFAULT false NOT NULL,
	"attivo" boolean DEFAULT true NOT NULL,
	"impostazioni" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "canali_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
ALTER TABLE "batch_lotti" ADD CONSTRAINT "batch_lotti_batch_id_batch_pubblicazione_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batch_pubblicazione"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_lotti" ADD CONSTRAINT "batch_lotti_sku_id_sku_id_fk" FOREIGN KEY ("sku_id") REFERENCES "public"."sku"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_pubblicazione" ADD CONSTRAINT "batch_pubblicazione_canale_id_canali_id_fk" FOREIGN KEY ("canale_id") REFERENCES "public"."canali"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "batch_lotti_batch_idx" ON "batch_lotti" USING btree ("batch_id","sku_id");--> statement-breakpoint
CREATE INDEX "batch_pub_canale_idx" ON "batch_pubblicazione" USING btree ("canale_id","stato");
