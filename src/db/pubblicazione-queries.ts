import { and, eq, sql } from "drizzle-orm";
import { db } from "./index";
import {
  canali,
  batchPubblicazione,
  batchLotti,
  sku,
  type Canale,
} from "./schema";

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
export async function getCanaliConConteggio(): Promise
  (Canale & { batchTotali: number; batchInBozza: number })[]
> {
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

  const statoIniziale = batch.canale.tipo === "asta_fisica" ? "candidato" : "attivo";

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

// Equivalente dinamico di MASTER!QTY_DISPONIBILE_REALE: conta le righe
// batch_lotti dove il batch e' confermato, il canale e' esclusivo, e
// (asta_fisica: statoRiga=accettato) OR (asta_online/statico: statoRiga=attivo).
// Funzione (non costante) perche' sql`` e' mutabile via .mapWith() - stesso
// motivo di quantitaDisponibileSql/proprietaSql/numeroFotoSql in queries.ts.
export function impegnatoSql() {
  return sql<number>`(
    select count(*)::int
    from ${batchLotti} bl
    inner join ${batchPubblicazione} bp on bp.id = bl.batch_id
    inner join ${canali} c on c.id = bp.canale_id
    where bl.sku_id = "sku"."id"
      and bp.stato = 'confermato'
      and c.esclusivo = true
      and (
        (c.tipo = 'asta_fisica' and bl.stato_riga = 'accettato')
        or (c.tipo != 'asta_fisica' and bl.stato_riga = 'attivo')
      )
  )`;
}

export async function getImpegnatoPerSku(skuId: number): Promise<number> {
  const [riga] = await db
    .select({ impegnato: impegnatoSql() })
    .from(sku)
    .where(eq(sku.id, skuId));
  return riga?.impegnato ?? 0;
}
