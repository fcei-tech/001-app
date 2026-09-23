import { eq } from "drizzle-orm";
import { db } from "./index";
import {
  canali,
  batchPubblicazione,
  batchLotti,
} from "./schema";

// Canale non e' esportato come tipo da schema.ts (nessuna convenzione
// $inferSelect in uso li') - derivato qui localmente.
type Canale = typeof canali.$inferSelect;

export async function getCanali(): Promise<Canale[]> {
  return db.query.canali.findMany({
    where: (c, { eq }) => eq(c.attivo, true),
    orderBy: (c, { asc }) => asc(c.nome),
  });
}

export async function getCanaleById(id: number): Promise<Canale | undefined> {
  return db.query.canali.findFirst({ where: (c, { eq }) => eq(c.id, id) });
}

// Vista aggregata per la pagina elenco canali (prima fetta UI Pubblicazione,
// 2026-09-23): quanti batch esistono per canale e quanti sono ancora in
// bozza (modificabili). N+1 query deliberata - i canali sono ~11, i batch
// per canale pochi, non vale la pena di un'aggregazione SQL per questo
// primo taglio.
export async function getCanaliConConteggio(): Promise<(Canale & { batchTotali: number; batchInBozza: number })[]> {
  const elenco = await getCanali();
  return Promise.all(
    elenco.map(async (c) => {
      const batch = await db.query.batchPubblicazione.findMany({
        where: (b, { eq }) => eq(b.canaleId, c.id),
        columns: { stato: true },
      });
      return {
        ...c,
        batchTotali: batch.length,
        batchInBozza: batch.filter((b) => b.stato === "bozza").length,
      };
    })
  );
}

export async function creaCanale(dati: {
  nome: string;
  tipo: "statico" | "asta_online" | "asta_fisica";
  esclusivo?: boolean;
}) {
  const [canale] = await db.insert(canali).values(dati).returning();
  return canale;
}

export async function creaBatch(canaleId: number) {
  const [batch] = await db
    .insert(batchPubblicazione)
    .values({ canaleId })
    .returning();
  return batch;
}

export async function getBatchPerCanale(canaleId: number) {
  return db.query.batchPubblicazione.findMany({
    where: (b, { eq }) => eq(b.canaleId, canaleId),
    orderBy: (b, { desc }) => desc(b.createdAt),
    // solo per il conteggio lotti nella lista - dettaglio vero in getBatch()
    with: { lotti: { columns: { id: true } } },
  });
}

export async function getBatch(id: number) {
  return db.query.batchPubblicazione.findFirst({
    where: (b, { eq }) => eq(b.id, id),
    with: {
      canale: true,
      lotti: { with: { sku: true } },
    },
  });
}

export async function aggiungiLotti(batchId: number, skuIds: number[]) {
  const batch = await db.query.batchPubblicazione.findFirst({
    where: (b, { eq }) => eq(b.id, batchId),
    with: { canale: true },
  });
  if (!batch) throw new Error("Batch non trovato");
  if (batch.stato !== "bozza") {
    throw new Error("Non si puo' modificare un batch gia' confermato");
  }

  const statoIniziale: "attivo" | "candidato" | "accettato" =
    batch.canale.tipo === "asta_fisica" ? "candidato" : "attivo";

  await db
    .insert(batchLotti)
    .values(skuIds.map((skuId) => ({ batchId, skuId, statoRiga: statoIniziale })));
}

// Rimuove un lotto da un batch ancora in bozza. Il chiamante (server action)
// verifica lo stato del batch PRIMA di chiamare questa funzione - qui
// nessun controllo di stato, e' una funzione di basso livello.
export async function rimuoviLotto(batchLottoId: number) {
  await db.delete(batchLotti).where(eq(batchLotti.id, batchLottoId));
}

// Segna un lotto "candidato" (solo canali asta_fisica) come "accettato" -
// cioe' la casa d'asta lo ha davvero preso in consegna, e da questo momento
// consuma disponibilita' (vedi impegnatoSql in src/db/queries.ts). Nessun
// controllo di stato batch qui (stesso principio di basso livello di
// rimuoviLotto sopra) - il chiamante verifica canale.tipo/statoRiga prima.
export async function accettaLotto(batchLottoId: number) {
  await db
    .update(batchLotti)
    .set({ statoRiga: "accettato" })
    .where(eq(batchLotti.id, batchLottoId));
}

export async function confermaBatch(batchId: number, snapshot: unknown) {
  const batch = await db.query.batchPubblicazione.findFirst({
    where: (b, { eq }) => eq(b.id, batchId),
  });
  if (!batch) throw new Error("Batch non trovato");
  if (batch.stato !== "bozza") {
    throw new Error("Batch gia' confermato o generato");
  }

  await db
    .update(batchPubblicazione)
    .set({ stato: "confermato", snapshot, confermatoAt: new Date() })
    .where(eq(batchPubblicazione.id, batchId));
}

export async function segnaBatchGenerato(batchId: number) {
  await db
    .update(batchPubblicazione)
    .set({ stato: "generato" })
    .where(eq(batchPubblicazione.id, batchId));
}

// Elimina un batch SOLO in stato bozza (2026-09-23 sera, richiesta esplicita
// utente dopo test installazione reale: "manca la gestione batch, non posso
// mai cancellarli"). Un batch confermato/generato non si puo' mai eliminare
// - ha gia' consumato disponibilita' su un canale esclusivo (impegnatoSql)
// e/o prodotto un export reale, cancellarlo silenziosamente romperebbe
// quella contabilita'. Nessuna eccezione, nessun bottone "forza" in UI.
// batch_lotti non ha onDelete cascade sullo schema (vedi schema.ts) -
// cancellazione manuale delle righe figlie prima del batch, dentro una
// transazione (stesso pattern gia' in uso in src/app/magazzino/actions.ts).
export async function eliminaBatch(batchId: number) {
  const batch = await db.query.batchPubblicazione.findFirst({
    where: (b, { eq }) => eq(b.id, batchId),
  });
  if (!batch) throw new Error("Batch non trovato");
  if (batch.stato !== "bozza") {
    throw new Error("Non si puo' eliminare un batch gia' confermato");
  }

  await db.transaction(async (tx) => {
    await tx.delete(batchLotti).where(eq(batchLotti.batchId, batchId));
    await tx.delete(batchPubblicazione).where(eq(batchPubblicazione.id, batchId));
  });
}
