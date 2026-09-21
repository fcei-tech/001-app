INSERT INTO "tipi_oggetto" ("nome") VALUES ('Poster') ON CONFLICT ("nome") DO NOTHING;--> statement-breakpoint
INSERT INTO "ubicazioni" ("nome", "tipo") VALUES
	('Deposito', 'deposito'),
	('Cambi', 'asta_fisica'),
	('Bolaffi', 'asta_fisica'),
	('Wannenes', 'asta_fisica')
ON CONFLICT ("nome") DO NOTHING;
