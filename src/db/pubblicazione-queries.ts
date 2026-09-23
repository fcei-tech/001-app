import { and, eq, sql } from "drizzle-orm";
import { db } from "./index";
import { batchLotti, batchPubblicazione, canali, sku } from "./schema";

export type Canale = typeof canali.$inferSelect;
export type NuovoCanale = typeof canali.$inferInsert;
export type Batch = typeof batchPubblicazione.$inferSelect;
export type BatchLotto = typeof batchLotti.$inferSelect;

// --- Canali --------------------------------------------------------------

export async function getCanali(): Promise<Canale[]> {
  return db.query.canali.findMany({
    orderBy: (c, { asc }) => asc(c.nome),
  });
}

export async function creaCanale(input: {
  nome: string;
  tipo: Canale["tipo"];
  esclusivo: boolean;
  impostazioni?: Record<string, unknown>;
}) {
  const [nuovo] = await db
    .insert(canali)
    .values({
      nome: input.nome,
      tipo: input.tipo,
      esclusivo: input.esclusivo,
      impostazioni: input.impostazioni ?? {},
    })
    .returning();
  return nuovo;
}

// --- Batch -----------------------------------------------------------------
// Modello batch-con-snapshot (vedi sequenza_operativa_e_batch_2026_09_14):
// creaBatch/aggiungiLotti lavorano in stato "bozza" (nessun effetto su
// impegnato, liberamente modificabile). confermaBatch e' l'unico punto che
// congela lo snapshot e fa scattare il consumo di disponibilita' - da quel
// momento lo snapshot non viene mai piu' ricalcolato dai dati live.

export async function creaBatch(canaleId: number) {
  const [nuovo] = await db.insert(batchPubblicazione).values({ canaleId }).returning();
  return nuovo;
}

export async function getBatch(batchId: number) {
  return db.query.batchPubblicazione.findFirst({
    where: (b, { eq }) => eq(b.id, batchId),
    with: { canale: true, lotti: { with: { sku: true } } },
  });
}

export async function getBatchPerCanale(canaleId: number) {
  return db.query.batchPubblicazione.findMany({
    where: (b, { eq }) => eq(b.canaleId, canaleId),
    orderBy: (b, { desc }) => desc(b.createdAt),
  });
}

// Aggiunge lotti a un batch in bozza. Lo stato riga iniziale dipende dal
// tipo di canale: asta_fisica parte da "candidato" (non consuma finche' non
// e' "accettato" - vedi meccanismo_aste_candidato_accettato_2026_09_14),
// statico/asta_online partono da "attivo" (nessuno stato candidato per
// questi due tipi).
export async function aggiungiLotti(batchId: number, skuIds: number[]) {
  const batch = await db.query.batchPubblicazione.findFirst({
    where: (b, { eq }) => eq(b.id, batchId),
    with: { canale: true },
  });
  if (!batch) throw new Error(`Batch ${batchId} non trovato`);
  if (batch.stato !== "bozza") {
    throw new Error("Non si possono aggiungere lotti a un batch gia' confermato");
  }

  const statoIniziale: BatchLotto["statoRiga"] =
    batch.canale.tipo === "asta_fisica" ? "candidato" : "attivo";

  if (skuIds.length === 0) return [];
  return db
    .insert(batchLotti)
    .values(skuIds.map((skuId) => ({ batchId, skuId, statoRiga: statoIniziale })))
    .returning();
}

// Solo per canali asta_fisica: un lotto candidato diventa accettato da una
// specifica casa d'asta - da questo momento consuma disponibilita'. La
// scelta di QUALE casa accetta, quando piu' di una si propone, resta
// sempre manuale (nessuna automazione), qui si registra solo l'esito.
export async function accettaLotto(batchLottoId: number) {
  const [aggiornato] = await db
    .update(batchLotti)
    .set({ statoRiga: "accettato" })
    .where(eq(batchLotti.id, batchLottoId))
    .returning();
  return aggiornato;
}

// Congela lo snapshot e sposta il batch in "confermato": da questo momento
// impegnatoSql() inizia a contare i suoi lotti (secondo le regole del tipo
// di canale, vedi sotto). Lo snapshot passato qui va costruito a monte con
// i valori finali gia' risolti (livelli 1/2/3 + override) - questa funzione
// non ricalcola nulla, si limita a persisterlo.
export async function confermaBatch(batchId: number, snapshot: unknown) {
  const [aggiornato] = await db
    .update(batchPubblicazione)
    .set({ stato: "confermato", snapshot, confermatoAt: new Date() })
    .where(and(eq(batchPubblicazione.id, batchId), eq(batchPubblicazione.stato, "bozza")))
    .returning();
  if (!aggiornato) {
    throw new Error("Batch non trovato o non piu' in stato bozza");
  }
  return aggiornato;
}

export async function segnaBatchGenerato(batchId: number) {
  const [aggiornato] = await db
    .update(batchPubblicazione)
    .set({ stato: "generato" })
    .where(eq(batchPubblicazione.id, batchId))
    .returning();
  return aggiornato;
}

// --- Impegnato ---------------------------------------------------------
// Equivalente dinamico di MASTER!QTY_DISPONIBILE_REALE del vecchio Excel
// (vedi controllo_scorte_aste_2026_09_09): quanti pezzi di uno sku sono
// oggi "promessi" su un canale esclusivo, quindi non piu' liberamente
// disponibili altrove. Conta 1 per ogni riga batch_lotti che rispetta
// TUTTE queste condizioni:
//  - il batch che la contiene e' "confermato" (una bozza non impegna nulla)
//  - il canale del batch ha esclusivo=true (Shopify/eBay/Etsy/Subito non
//    consumano mai, lavorano apposta in parallelo sullo stesso pezzo)
//  - per canali asta_fisica: solo stato_riga='accettato' consuma (un
//    candidato NON consuma, si puo' candidare lo stesso pezzo a piu' case)
//  - per canali asta_online: stato_riga e' sempre 'attivo' quando il batch
//    e' confermato (nessuno stato candidato per questo tipo), consuma
//    sempre - presentare il lotto equivale ad accettazione istantanea.
// Funzione (non costante) per lo stesso motivo di quantitaDisponibileSql/
// proprietaSql/numeroFotoSql in queries.ts: sql`` e' mutabile via
// .mapWith(), una funzione garantisce un frammento fresco a ogni chiamata.
//
// NOTA IMPORTANTE (bug trovato e corretto in fase di test, prima di
// consegnare): la correlazione con lo sku esterno usa il letterale
// "sku"."id" invece di interpolare ${sku.id}. Interpolando il Column
// object, Drizzle qualifica il riferimento in base a cio' che SA della
// query (il proprio query-builder), non al testo SQL grezzo iniettato
// qui dentro - non "vede" che batch_lotti/batch_pubblicazione/canali
// hanno anch'esse una colonna "id", quindi a volte omette il prefisso
// tabella e produce un "id" nudo, che Postgres rifiuta con "column
// reference is ambiguous" (verificato dal vivo su PGlite). Il letterale
// e' sicuro perche' ovunque in questo codebase la query esterna fa
// sempre .from(sku) SENZA alias (stesso presupposto gia' implicito in
// numeroFotoSql/quantitaDisponibileSql/proprietaSql sopra).
export const impegnatoSql = () => sql<number>`coalesce((
  select count(*)
  from ${batchLotti} bl
  inner join ${batchPubblicazione} bp on bp.id = bl.batch_id
  inner join ${canali} c on c.id = bp.canale_id
  where bl.sku_id = "sku"."id"
    and bp.stato = 'confermato'
    and c.esclusivo = true
    and (
      (c.tipo = 'asta_fisica' and bl.stato_riga = 'accettato')
      or (c.tipo = 'asta_online' and bl.stato_riga = 'attivo')
    )
), 0)`;

export async function getImpegnatoPerSku(skuId: number): Promise<number> {
  const [{ impegnato }] = await db
    .select({ impegnato: impegnatoSql().mapWith(Number) })
    .from(sku)
    .where(eq(sku.id, skuId));
  return impegnato ?? 0;
}
