ALTER TABLE "canali" ADD COLUMN "colori" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
-- Colori attuali (prima fissi per nome in colori-canali.ts) copiati nel database; Libero riceve un grigio proposto.
UPDATE "canali" SET "colori" = '["#95BF47"]'::jsonb WHERE "nome" = 'Shopify';--> statement-breakpoint
UPDATE "canali" SET "colori" = '["#E53238", "#0064D2", "#F5AF02", "#86B817"]'::jsonb WHERE "nome" = 'eBay';--> statement-breakpoint
UPDATE "canali" SET "colori" = '["#F1641E"]'::jsonb WHERE "nome" = 'Etsy';--> statement-breakpoint
UPDATE "canali" SET "colori" = '["#B01030"]'::jsonb WHERE "nome" = 'Subito';--> statement-breakpoint
UPDATE "canali" SET "colori" = '["#0033FF"]'::jsonb WHERE "nome" = 'Catawiki';--> statement-breakpoint
UPDATE "canali" SET "colori" = '["#86B817", "#F5AF02", "#0064D2", "#E53238"]'::jsonb WHERE "nome" = 'eBay Asta';--> statement-breakpoint
UPDATE "canali" SET "colori" = '["#1B6B63"]'::jsonb WHERE "nome" = 'Bidspirit';--> statement-breakpoint
UPDATE "canali" SET "colori" = '["#1B3A5C"]'::jsonb WHERE "nome" = 'Cambi';--> statement-breakpoint
UPDATE "canali" SET "colori" = '["#8B6914"]'::jsonb WHERE "nome" = 'Bolaffi';--> statement-breakpoint
UPDATE "canali" SET "colori" = '["#5B3256"]'::jsonb WHERE "nome" = 'Wannenes';--> statement-breakpoint
UPDATE "canali" SET "colori" = '["#6B7280"]'::jsonb WHERE "nome" = 'Libero';
