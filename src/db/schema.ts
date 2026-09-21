import { relations } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  serial,
  text,
  numeric,
  integer,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

// --- Vocabolari chiusi -------------------------------------------------
// Condizione: scala a 6 gradi presa dal dizionario ufficiale Catawiki
// (Posters_dictionary.csv / D:Condition). Default sku = 'A-'.
export const condizioneEnum = pgEnum("condizione", [
  "A",
  "A-",
  "B+",
  "B",
  "B-",
  "C",
]);

// Proprieta': asse chiuso a 3 valori (esteso 2026-09-17, era solo FP/CV).
// FP = materiale aziendale (valore di carico obbligatorio, margine pieno).
// CV = collezione privata condivisa (proprietario, socio) - nessun valore
// di carico, la societa' trattiene una percentuale calcolata su formula
// (vedi note di progetto, non ancora implementata: soglia 100 EUR, sotto
// 25 EUR fissi, sopra 25% del valore - logica del futuro Registro Vendite,
// non del Magazzino).
// TERZI = merce di collezionisti esterni affidata su base contrattuale,
// piu' proprietari distinti possibili (anagrafica dedicata, da costruire
// quando arriva la prima merce di questo tipo - oggi nessuna in gestione,
// il valore resta qui solo per non dover fare una migrazione futura).
export const proprietaEnum = pgEnum("proprieta", ["FP", "CV", "TERZI"]);

// --- Vocabolari aperti (tabelle di lookup, editabili da Impostazioni) --

// Tipo oggetto: oggi solo 'Poster', aperto per futuri tipi (Quadro, ecc.)
export const tipiOggetto = pgTable("tipi_oggetto", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull().unique(),
  attivo: boolean("attivo").notNull().default(true),
});

// Ubicazione fisica: depositi propri + case d'asta fisiche, elenco aperto.
export const ubicazioni = pgTable("ubicazioni", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull().unique(),
  // 'deposito' | 'asta_fisica' - non enum chiuso a livello DB per restare
  // coerente con "elenco aperto", ma vincolato in applicazione.
  tipo: text("tipo").notNull().default("deposito"),
  attivo: boolean("attivo").notNull().default(true),
});

// --- Magazzino -----------------------------------------------------------
// Identita' sku: un modello/soggetto specifico di poster. Generazione nuovi
// sku CONFERMATA invariata: sequenza Z-NNNNN (storici restano alfanumerici).
export const sku = pgTable("sku", {
  id: serial("id").primaryKey(),
  skuCode: text("sku_code").notNull().unique(),

  artista: text("artista").notNull(),
  opera: text("opera").notNull(),
  larghezza: numeric("larghezza", { precision: 6, scale: 1 }), // cm
  altezza: numeric("altezza", { precision: 6, scale: 1 }), // cm
  supporto: text("supporto"), // es. TELATO, CARTA - testo libero per ora

  anno: text("anno"), // epoca/anno, facoltativo, testo libero ("circa 1965")

  condizione: condizioneEnum("condizione").notNull().default("A-"),
  tipoId: integer("tipo_id")
    .notNull()
    .references(() => tipiOggetto.id),

  tag: text("tag"), // testo libero personale, nessun vocabolario chiuso
  note: text("note"),

  bloccatoVendita: boolean("bloccato_vendita").notNull().default(false),

  // Valore di carico: OBBLIGATORIO in applicazione quando proprieta=FP
  // (costo di acquisto, per calcolare il margine alla vendita). Nullable
  // a livello DB (non ha senso su CV/TERZI, che non hanno un costo di
  // acquisto aziendale) - vincolo "obbligatorio per FP" fatto rispettare
  // in form/import, non con un CHECK, coerente con lo stile gia' in uso
  // per gli altri campi condizionali di questo schema.
  valoreCarico: numeric("valore_carico", { precision: 10, scale: 2 }),

  // Dati commerciali (livello 2, editati dopo l'inserimento fisico)
  prezzoEbay: numeric("prezzo_ebay", { precision: 10, scale: 2 }),
  prezzoCatawiki: numeric("prezzo_catawiki", { precision: 10, scale: 2 }),
  riservaCatawiki: numeric("riserva_catawiki", { precision: 10, scale: 2 }),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Foto sku: galleria ordinata, upload su Shopify CDN (stagedUploadsCreate +
// fileCreate via Admin API - vedi lib/shopify.ts). url e' il link CDN
// definitivo restituito da Shopify dopo il processing del file caricato.
// ordine=0 e' la copertina (prima immagine mostrata/usata sui portali).
export const fotoSku = pgTable(
  "foto_sku",
  {
    id: serial("id").primaryKey(),
    skuId: integer("sku_id")
      .notNull()
      .references(() => sku.id),
    url: text("url").notNull(),
    ordine: integer("ordine").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("foto_sku_sku_idx").on(table.skuId, table.ordine)]
);

// Registro movimenti: fonte di verita' dello stock, per combinazione
// sku + proprieta + ubicazione. MAI un campo quantita' sovrascritto.
export const movimentiMagazzino = pgTable(
  "movimenti_magazzino",
  {
    id: serial("id").primaryKey(),
    skuId: integer("sku_id")
      .notNull()
      .references(() => sku.id),
    proprieta: proprietaEnum("proprieta").notNull(),
    ubicazioneId: integer("ubicazione_id")
      .notNull()
      .references(() => ubicazioni.id),

    // Vocabolario APERTO per costruzione: carico, vendita_<canale>,
    // vendita_diretta_fattura, correzione, asta_fisica_accettata, ...
    // Testo libero (vincolato in applicazione), non enum DB - per poter
    // aggiungere nuove causali senza modifiche di schema.
    causale: text("causale").notNull(),

    quantitaDelta: integer("quantita_delta").notNull(),
    note: text("note"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("mov_sku_idx").on(table.skuId, table.createdAt)]
);

// --- Relazioni (per db.query.*.findFirst/findMany con `with`) ----------
export const skuRelations = relations(sku, ({ one, many }) => ({
  tipo: one(tipiOggetto, { fields: [sku.tipoId], references: [tipiOggetto.id] }),
  movimenti: many(movimentiMagazzino),
  foto: many(fotoSku),
}));

export const movimentiMagazzinoRelations = relations(movimentiMagazzino, ({ one }) => ({
  sku: one(sku, { fields: [movimentiMagazzino.skuId], references: [sku.id] }),
  ubicazione: one(ubicazioni, {
    fields: [movimentiMagazzino.ubicazioneId],
    references: [ubicazioni.id],
  }),
}));

export const fotoSkuRelations = relations(fotoSku, ({ one }) => ({
  sku: one(sku, { fields: [fotoSku.skuId], references: [sku.id] }),
}));
