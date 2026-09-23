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
  jsonb,
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

// --- Vocabolari Pubblicazione (modulo 2026-09-23, struttura di base) ---
// Tipo canale: determina quale meccanismo di consumo disponibilita' si
// applica (vedi meccanismo_aste_candidato_accettato_2026_09_14):
// - statico: Shopify/eBay/Etsy/Subito, sempre paralleli, mai esclusivi.
// - asta_online: Catawiki/Bidspirit/eBay Asta, nessuno stato candidato,
//   presentare il lotto = accettazione istantanea = consumo istantaneo.
// - asta_fisica: Cambi/Bolaffi/Wannenes/Libero, candidato NON consuma
//   (si puo' candidare lo stesso pezzo a piu' case in parallelo),
//   accettato SI' consuma - scelta di consegna sempre manuale.
export const canaleTipoEnum = pgEnum("canale_tipo", [
  "statico",
  "asta_online",
  "asta_fisica",
]);

// Stato batch: bozza (selezione/anteprima ancora modificabile, nessun
// effetto su impegnato) -> confermato (snapshot congelato, consuma
// disponibilita' secondo le regole del canale) -> generato (output
// prodotto almeno una volta, ripetibile - vedi sequenza_operativa_e_
// batch_2026_09_14, "generazione" e' un evento ripetibile sullo stesso
// batch confermato, non un nuovo stato terminale).
export const batchStatoEnum = pgEnum("batch_stato", [
  "bozza",
  "confermato",
  "generato",
]);

// Stato riga (per singolo lotto dentro un batch): 'attivo' e' l'unico
// stato rilevante per canali statico/asta_online (nessun concetto di
// candidatura). 'candidato'/'accettato' si applicano solo a batch su
// canali asta_fisica - vedi canaleTipoEnum sopra.
export const lottoStatoEnum = pgEnum("lotto_stato", [
  "attivo",
  "candidato",
  "accettato",
]);

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

// --- Pubblicazione (modulo 2026-09-23, struttura di base: canale/batch/
// impegnato) --------------------------------------------------------------
// Canale come entita' di prima classe (vedi canale_entita_prima_classe_
// 2026_09_14 e conferma_architettura_canale_2026_09_23): sostituisce le
// colonne PUB_*/FISICO_* fisse del vecchio Master con righe - aggiungere
// un portale e' inserire una riga, non modificare lo schema.
// "impostazioni" (jsonb) porta il livello 1 (valore fisso/singolo per
// eBay/Shopify/Subito; default di riferimento per Catawiki/Bidspirit, i
// cui livelli 2/3 veri vivono per-batch, non per-canale) - scelta
// deliberata jsonb invece di colonne tipizzate per canale, per restare
// "parassita": un nuovo canale/modulo si aggiunge senza mai alterare
// questa tabella.
export const canali = pgTable("canali", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull().unique(),
  tipo: canaleTipoEnum("tipo").notNull(),
  // true per i 7 canali "un pezzo alla volta" (Catawiki/Bidspirit/eBay
  // Asta/le 4 fisiche - vedi scope_confermato in controllo_scorte_aste_
  // 2026_09_09), false per Shopify/eBay/Etsy/Subito che lavorano apposta
  // in parallelo sullo stesso pezzo. Guida il calcolo di "impegnato".
  esclusivo: boolean("esclusivo").notNull().default(false),
  attivo: boolean("attivo").notNull().default(true),
  impostazioni: jsonb("impostazioni").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Batch: fascicolo di una singola pubblicazione su un canale. Modello
// batch-con-snapshot (sequenza_operativa_e_batch_2026_09_14): "snapshot"
// resta null finche' il batch e' in bozza (nessun effetto su impegnato),
// viene scritto UNA VOLTA alla conferma e mai piu' ricalcolato - rigenerare
// l'output piu' tardi rilegge lo snapshot, non i dati live del Magazzino.
// "impostazioniBatch" porta i livelli 2/3 (switch di modalita', modificatori
// percentuale/valore) rilevanti solo per Catawiki/Bidspirit - vuoto/ignorato
// per gli altri tipi di canale.
export const batchPubblicazione = pgTable(
  "batch_pubblicazione",
  {
    id: serial("id").primaryKey(),
    canaleId: integer("canale_id")
      .notNull()
      .references(() => canali.id),
    stato: batchStatoEnum("stato").notNull().default("bozza"),
    impostazioniBatch: jsonb("impostazioni_batch").notNull().default({}),
    snapshot: jsonb("snapshot"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    confermatoAt: timestamp("confermato_at"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("batch_pub_canale_idx").on(table.canaleId, table.stato)]
);

// Lotti di un batch: uno sku selezionato per quella pubblicazione.
// "override" (jsonb, opzionale) e' il meccanismo usa-e-getta (override_
// per_lotto_2026_09_14): vince su qualsiasi livello del canale/batch per
// quel campo, non scrive MAI nel Magazzino, non ha storicizzazione oltre
// la vita del batch stesso.
export const batchLotti = pgTable(
  "batch_lotti",
  {
    id: serial("id").primaryKey(),
    batchId: integer("batch_id")
      .notNull()
      .references(() => batchPubblicazione.id),
    skuId: integer("sku_id")
      .notNull()
      .references(() => sku.id),
    statoRiga: lottoStatoEnum("stato_riga").notNull().default("attivo"),
    override: jsonb("override"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("batch_lotti_batch_idx").on(table.batchId, table.skuId)]
);

// --- Relazioni (per db.query.*.findFirst/findMany con `with`) ----------
export const skuRelations = relations(sku, ({ one, many }) => ({
  tipo: one(tipiOggetto, { fields: [sku.tipoId], references: [tipiOggetto.id] }),
  movimenti: many(movimentiMagazzino),
  foto: many(fotoSku),
  batchLotti: many(batchLotti),
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

export const canaliRelations = relations(canali, ({ many }) => ({
  batch: many(batchPubblicazione),
}));

export const batchPubblicazioneRelations = relations(batchPubblicazione, ({ one, many }) => ({
  canale: one(canali, { fields: [batchPubblicazione.canaleId], references: [canali.id] }),
  lotti: many(batchLotti),
}));

export const batchLottiRelations = relations(batchLotti, ({ one }) => ({
  batch: one(batchPubblicazione, {
    fields: [batchLotti.batchId],
    references: [batchPubblicazione.id],
  }),
  sku: one(sku, { fields: [batchLotti.skuId], references: [sku.id] }),
}));
