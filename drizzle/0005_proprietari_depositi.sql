CREATE TABLE "proprietari" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"tipo" text DEFAULT 'terzo' NOT NULL,
	"conta_valore_aziendale" boolean DEFAULT false NOT NULL,
	"attivo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "proprietari_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
-- Proprietari di partenza: FP = la societa', CV = i due soci a titolo privato.
INSERT INTO "proprietari" ("nome", "tipo", "conta_valore_aziendale") VALUES ('FP', 'azienda', true), ('CV', 'soci', false);
--> statement-breakpoint
-- TERZI esisteva solo come valore dell'enum: lo si crea solo se e' stato usato davvero.
INSERT INTO "proprietari" ("nome", "tipo", "conta_valore_aziendale")
SELECT 'TERZI', 'terzo', false WHERE EXISTS (SELECT 1 FROM "movimenti_magazzino" WHERE "proprieta"::text = 'TERZI');
--> statement-breakpoint
ALTER TABLE "movimenti_magazzino" ADD COLUMN "proprietario_id" integer;--> statement-breakpoint
UPDATE "movimenti_magazzino" m SET "proprietario_id" = p."id" FROM "proprietari" p WHERE p."nome" = m."proprieta"::text;--> statement-breakpoint
-- Consegne a case d'asta gia' registrate: i dettagli salvati portavano il nome della proprieta'.
UPDATE "batch_lotti" b
SET "consegna_dettagli" = (b."consegna_dettagli" - 'proprieta') || jsonb_build_object('proprietarioId', p."id")
FROM "proprietari" p
WHERE b."consegna_dettagli" IS NOT NULL
  AND b."consegna_dettagli"->>'proprieta' IS NOT NULL
  AND p."nome" = b."consegna_dettagli"->>'proprieta';--> statement-breakpoint
ALTER TABLE "movimenti_magazzino" ALTER COLUMN "proprietario_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "movimenti_magazzino" ADD CONSTRAINT "movimenti_magazzino_proprietario_id_proprietari_id_fk" FOREIGN KEY ("proprietario_id") REFERENCES "public"."proprietari"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimenti_magazzino" DROP COLUMN "proprieta";--> statement-breakpoint
DROP TYPE "public"."proprieta";--> statement-breakpoint
ALTER TABLE "ubicazioni" ADD COLUMN "vendibile" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "ubicazioni" ADD COLUMN "fiscale" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ubicazioni" ADD COLUMN "referente" text;--> statement-breakpoint
-- Le case d'asta non sono vendibili finche' il pezzo e' li'; "Deposito" e' il magazzino fiscale.
UPDATE "ubicazioni" SET "vendibile" = false WHERE "tipo" = 'asta_fisica';--> statement-breakpoint
UPDATE "ubicazioni" SET "fiscale" = true WHERE "nome" = 'Deposito';--> statement-breakpoint
-- Secondo deposito aziendale di partenza (solo se non esiste gia').
INSERT INTO "ubicazioni" ("nome", "tipo", "vendibile", "fiscale") VALUES ('Deposito 2', 'deposito', true, false) ON CONFLICT ("nome") DO NOTHING;
