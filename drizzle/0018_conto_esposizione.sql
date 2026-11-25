-- Libero diventa "Conto esposizione" (portale e deposito insieme) e il tipo deposito "esposizione" sparisce.
UPDATE "canali" SET "nome" = 'Conto esposizione' WHERE "nome" = 'Libero' AND NOT EXISTS (SELECT 1 FROM "canali" WHERE "nome" = 'Conto esposizione');--> statement-breakpoint
UPDATE "ubicazioni" SET "nome" = 'Conto esposizione' WHERE "nome" = 'Libero' AND "tipo" = 'asta_fisica' AND NOT EXISTS (SELECT 1 FROM "ubicazioni" WHERE "nome" = 'Conto esposizione');--> statement-breakpoint
UPDATE "ubicazioni" SET "tipo" = 'deposito' WHERE "tipo" = 'esposizione';
