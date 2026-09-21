CREATE TYPE "public"."condizione" AS ENUM('A', 'A-', 'B+', 'B', 'B-', 'C');--> statement-breakpoint
CREATE TYPE "public"."proprieta" AS ENUM('FP', 'CV', 'TERZI');--> statement-breakpoint
CREATE TABLE "foto_sku" (
	"id" serial PRIMARY KEY NOT NULL,
	"sku_id" integer NOT NULL,
	"url" text NOT NULL,
	"ordine" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "movimenti_magazzino" (
	"id" serial PRIMARY KEY NOT NULL,
	"sku_id" integer NOT NULL,
	"proprieta" "proprieta" NOT NULL,
	"ubicazione_id" integer NOT NULL,
	"causale" text NOT NULL,
	"quantita_delta" integer NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sku" (
	"id" serial PRIMARY KEY NOT NULL,
	"sku_code" text NOT NULL,
	"artista" text NOT NULL,
	"opera" text NOT NULL,
	"larghezza" numeric(6, 1),
	"altezza" numeric(6, 1),
	"supporto" text,
	"anno" text,
	"condizione" "condizione" DEFAULT 'A-' NOT NULL,
	"tipo_id" integer NOT NULL,
	"tag" text,
	"note" text,
	"bloccato_vendita" boolean DEFAULT false NOT NULL,
	"valore_carico" numeric(10, 2),
	"prezzo_ebay" numeric(10, 2),
	"prezzo_catawiki" numeric(10, 2),
	"riserva_catawiki" numeric(10, 2),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sku_sku_code_unique" UNIQUE("sku_code")
);
--> statement-breakpoint
CREATE TABLE "tipi_oggetto" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"attivo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "tipi_oggetto_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "ubicazioni" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"tipo" text DEFAULT 'deposito' NOT NULL,
	"attivo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "ubicazioni_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
ALTER TABLE "foto_sku" ADD CONSTRAINT "foto_sku_sku_id_sku_id_fk" FOREIGN KEY ("sku_id") REFERENCES "public"."sku"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimenti_magazzino" ADD CONSTRAINT "movimenti_magazzino_sku_id_sku_id_fk" FOREIGN KEY ("sku_id") REFERENCES "public"."sku"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimenti_magazzino" ADD CONSTRAINT "movimenti_magazzino_ubicazione_id_ubicazioni_id_fk" FOREIGN KEY ("ubicazione_id") REFERENCES "public"."ubicazioni"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sku" ADD CONSTRAINT "sku_tipo_id_tipi_oggetto_id_fk" FOREIGN KEY ("tipo_id") REFERENCES "public"."tipi_oggetto"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "foto_sku_sku_idx" ON "foto_sku" USING btree ("sku_id","ordine");--> statement-breakpoint
CREATE INDEX "mov_sku_idx" ON "movimenti_magazzino" USING btree ("sku_id","created_at");