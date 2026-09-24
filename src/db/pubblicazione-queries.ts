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

export async function aggiungiLotti(
  batchId: number,
  voci: { skuId: number; prezzo?: string; riserva?: string }[]
) {
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

  // Prezzo/riserva evento (2026-09-24, richiesta esplicita utente: "aste
  // online dove potrei voler variare i prezzi per eventi di pubblicazioni
  // particolari" + "le modifiche voglio poterle fare ovunque, sia nel
  // picker che nella lista lotti picked") - se gia' compilati nel picker
  // (SelettoreLottiBatch, solo asta_online), finiscono subito nell'override
  // del lotto appena creato. Stesso campo rieditabile dopo in "Lotti nel
  // batch" (vedi aggiornaOverrideLotto sotto) - mai scritto nel Magazzino,
  // stesso principio della Riserva proposta (asta_fisica).
  await db.insert(batchLotti).values(
    voci.map((v) => {
      const pulito: OverrideLotto = {};
      if (v.prezzo?.trim()) pulito.prezzo = v.prezzo.trim();
      if (v.riserva?.trim()) pulito.riserva = v.riserva.trim();
      return {
        batchId,
        skuId: v.skuId,
        statoRiga: statoIniziale,
        override: Object.keys(pulito).length > 0 ? pulito : null,
      };
    })
  );
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

// Annulla l'accettazione di un lotto (torna da "accettato" a "candidato") -
// 2026-09-24, richiesta esplicita utente: "finche' non colleghiamo le
// vendite, deve essermi permesso liberare il lotto da questo stato". Senza
// questa via d'uscita un lotto accettato per errore (o un accordo saltato
// con la casa d'asta) blocca per sempre sia "Elimina batch" sia "Riporta in
// bozza" sull'intero batch, senza rimedio. Simmetrico ad accettaLotto:
// stesso principio di basso livello, nessun controllo di stato qui - il
// chiamante verifica canale/statoRiga prima. Una volta tornato "candidato"
// non consuma piu' disponibilita' (vedi impegnatoSql).
export async function annullaAccettazione(batchLottoId: number) {
  await db
    .update(batchLotti)
    .set({ statoRiga: "candidato" })
    .where(eq(batchLotti.id, batchLottoId));
}

// Forma dell'override per lotto (jsonb, vedi commento su batchLotti.override
// in schema.ts) - mai scritto nel Magazzino, vive solo per la vita del
// batch. Due usi distinti e mutuamente esclusivi per canale (2026-09-24,
// richiesta esplicita utente):
// - asta_fisica: "riservaProposta" - il valore che PROPONI tu alla casa
//   d'asta, non ha niente a che fare con le riserve/prezzi calcolati dal
//   vecchio Master (CV/FP) ne' con i dati "certi e fissi" del Magazzino.
// - asta_online (Catawiki, Bidspirit, eBay Asta): "prezzo"/"riserva" -
//   valore specifico di QUESTO batch/evento di pubblicazione (es. varia il
//   prezzo per un'asta particolare), anche qui mai scritto sullo sku nel
//   Magazzino, che resta la fonte "certa e fissa".
export type OverrideLotto = {
  riservaProposta?: string;
  prezzo?: string;
  riserva?: string;
};

// Scrive/azzera l'override di un singolo lotto nel batch. Ogni campo vuoto
// (stringa vuota o non passato) viene omesso - se il risultato e' un
// oggetto vuoto si scrive null (nessun override). Nessun controllo di stato
// batch/canale qui (stesso principio di basso livello delle altre funzioni
// di questo file) - il chiamante (server action) verifica canale/stato
// batch prima e decide quali campi passare.
export async function aggiornaOverrideLotto(batchLottoId: number, valori: OverrideLotto) {
  const pulito: OverrideLotto = {};
  if (valori.riservaProposta?.trim()) pulito.riservaProposta = valori.riservaProposta.trim();
  if (valori.prezzo?.trim()) pulito.prezzo = valori.prezzo.trim();
  if (valori.riserva?.trim()) pulito.riserva = valori.riserva.trim();
  await db
    .update(batchLotti)
    .set({ override: Object.keys(pulito).length > 0 ? pulito : null })
    .where(eq(batchLotti.id, batchLottoId));
}

// Riporta un batch confermato in bozza (2026-09-23 notte, richiesta esplicita
// utente: "mi sembra strano non poter gestire i batch confermati" - scappatoia
// semplice finche' non esiste la generazione output vera, vedi commento in
// confermaBatchAction). Bloccato se anche un solo lotto e' gia' "accettato"
// da una casa d'asta fisica: a quel punto la candidatura e' stata presa in
// consegna per davvero, riportare il batch in bozza (e quindi potenzialmente
// rimuovere quel lotto) romperebbe la contabilita' di impegnatoSql. Azzera
// anche lo snapshot: verra' rigenerato alla prossima conferma.
export async function riportaInBozza(batchId: number) {
  const batch = await db.query.batchPubblicazione.findFirst({
    where: (b, { eq }) => eq(b.id, batchId),
    with: { lotti: true },
  });
  if (!batch) throw new Error("Batch non trovato");
  if (batch.stato !== "confermato") {
    throw new Error("Solo un batch confermato puo' essere riportato in bozza");
  }
  if (batch.lotti.some((l) => l.statoRiga === "accettato")) {
    throw new Error("Non si puo' riportare in bozza un batch con lotti gia' accettati da una casa d'asta");
  }

  await db
    .update(batchPubblicazione)
    .set({ stato: "bozza", confermatoAt: null, snapshot: null })
    .where(eq(batchPubblicazione.id, batchId));
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

// Elimina un batch in QUALSIASI stato (bozza/confermato/generato) - regola
// ALLENTATA il 2026-09-24 su richiesta esplicita utente ("mi sembra strano
// non poter gestire i batch confermati", poi estesa a "posso cancellare il
// batch azzerando tutti i lotti contenuti in qualsiasi stato siano?").
// CAMBIO DI ROTTA rispetto alla versione precedente (2026-09-23 sera), che
// vietava sempre la cancellazione fuori da bozza - segnalato esplicitamente
// e confermato dall'utente prima di questa modifica.
// Nuova regola: sempre permesso TRANNE se anche un solo lotto e' gia'
// "accettato" da un'asta fisica - stesso identico guard di riportaInBozza,
// stesso motivo: a quel punto il pezzo e' fisicamente in mano alla casa
// d'asta, cancellare il batch farebbe perdere quella traccia nel software
// mentre il pezzo e' comunque fuori. Nessun problema invece per i lotti
// "attivo" (spariscono e basta, l'impegnato si libera da solo - vedi
// impegnatoSql, che conta solo i batch_lotti ancora esistenti) o
// "candidato" (non consumano comunque disponibilita').
// batch_lotti non ha onDelete cascade sullo schema (vedi schema.ts) -
// cancellazione manuale delle righe figlie prima del batch, dentro una
// transazione (stesso pattern gia' in uso in src/app/magazzino/actions.ts).
export async function eliminaBatch(batchId: number) {
  const batch = await db.query.batchPubblicazione.findFirst({
    where: (b, { eq }) => eq(b.id, batchId),
    with: { lotti: true },
  });
  if (!batch) throw new Error("Batch non trovato");
  if (batch.lotti.some((l) => l.statoRiga === "accettato")) {
    throw new Error("Non si puo' eliminare un batch con lotti gia' accettati da una casa d'asta");
  }

  await db.transaction(async (tx) => {
    await tx.delete(batchLotti).where(eq(batchLotti.batchId, batchId));
    await tx.delete(batchPubblicazione).where(eq(batchPubblicazione.id, batchId));
  });
}
