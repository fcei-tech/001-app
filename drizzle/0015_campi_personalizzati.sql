CREATE TABLE "campi_personalizzati" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"tipo" text DEFAULT 'testo' NOT NULL,
	"opzioni" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ordine" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campi_personalizzati_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
ALTER TABLE "sku" ADD COLUMN "campi_personalizzati" jsonb DEFAULT '{}'::jsonb NOT NULL;