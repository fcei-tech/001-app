CREATE TABLE "sku_tag" (
	"sku_id" integer NOT NULL,
	"tag_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sku_tag_sku_id_tag_id_pk" PRIMARY KEY("sku_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "tag" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"tipo" text DEFAULT 'soggetto' NOT NULL,
	"va_su_shopify" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tag_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
ALTER TABLE "sku_tag" ADD CONSTRAINT "sku_tag_sku_id_sku_id_fk" FOREIGN KEY ("sku_id") REFERENCES "public"."sku"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sku_tag" ADD CONSTRAINT "sku_tag_tag_id_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sku_tag_tag_idx" ON "sku_tag" USING btree ("tag_id");--> statement-breakpoint
INSERT INTO "tag" ("nome", "tipo") VALUES
	('res', 'interno'),
	('no res', 'interno'),
	('Alcolici e aperitivi', 'soggetto'),
	('Moda e profumi', 'soggetto'),
	('Motori e aviazione', 'soggetto'),
	('Animali', 'soggetto'),
	('Sport', 'soggetto'),
	('Pop art', 'soggetto'),
	('Pin-up e sensuale', 'soggetto'),
	('Viaggi e turismo', 'soggetto')
ON CONFLICT ("nome") DO NOTHING;
