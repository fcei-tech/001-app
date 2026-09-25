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
    // id per il conteggio lotti nella lista, statoRiga per calcolare quali
    // batch tengono una prenotazione reale (2026-09-25, vedi
    // contaLottiConPrenotazione in src/lib/prenotazione-batch.ts, usato dai
    // controlli esterni cancella/cambia-stato) - dettaglio completo del
    // lotto (sku, override) resta in getBatch()
    with: { lotti: { columns: { id: true, statoRiga: true } } },
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

// Riporta un batch (confermato O generato) in bozza. Origine: 2026-09-23
// notte, richiesta esplicita utente ("mi sembra strano non poter gestire i
// batch confermati" - scappatoia semplice finche' non esiste la generazione
// output vera, vedi commento in confermaBatchAction).
// CAMBIO DI ROTTA 2026-09-25 (vedi backlog_ux_FINALIZZATO_2026_09_25_sessione_3
// in claude/09c_python_pubblicazione.yaml, punto 2): rimosso il blocco per
// lotti gia' "accettato" - le transizioni di stato batch (bozza/confermato/
// generato) sono ora LIBERE in qualsiasi direzione. Il cliente ha confermato
// esplicitamente che candidato/accettato resta un asse indipendente, gia'
// gestito e gia' reversibile da Accetta/Annulla accettazione - non serve piu'
// un guard incrociato qui: un lotto puo' restare "accettato" dentro un batch
// tornato in bozza, semplicemente smette di consumare disponibilita' finche'
// il batch non torna confermato (vedi impegnatoSql: conta solo bp.stato =
// 'confermato'). Filosofia esplicitata dal cliente: "e' un picker senza
// modulo vendite agganciato [...] il torna indietro & simili" deve restare
// sempre possibile. Azzera anche lo snapshot: verra' rigenerato alla
// prossima conferma (a meno che non fosse gia' presente, vedi
// cambiaStatoBatch sotto per il caso generato->confermato che lo riusa).
export async function riportaInBozza(batchId: number) {
  const batch = await db.query.batchPubblicazione.findFirst({
    where: (b, { eq }) => eq(b.id, batchId),
  });
  if (!batch) throw new Error("Batch non trovato");
  if (batch.stato === "bozza") {
    throw new Error("Il batch e' gia' in bozza");
  }

  await db
    .update(batchPubblicazione)
    .set({ stato: "bozza", confermatoAt: null, snapshot: null })
    .where(eq(batchPubblicazione.id, batchId));
}

// Cambia lo stato di un batch a UNA qualsiasi delle 3 destinazioni
// (bozza/confermato/generato), in qualsiasi direzione - controllo esterno
// generico (2026-09-25, punto 2 del backlog UX FINALIZZATO, vedi nota
// CAMBIO_DI_ROTTA sopra su riportaInBozza per il testo completo della
// decisione). Usato sia dal controllo "Cambia stato" per singolo batch
// (pagina dettaglio batch e riga della lista batch di un canale) sia dalla
// versione multi-selezione (cambiaStatoBatchMultiplo sotto).
//
// - verso "bozza": equivalente a riportaInBozza sopra (azzera confermatoAt +
//   snapshot).
// - verso "confermato" o "generato": richiede almeno un lotto nel batch
//   (stesso guard gia' in uso in confermaBatchAction, esteso qui a tutte le
//   direzioni che escono da bozza) e uno snapshot valorizzato - se il batch
//   ha gia' uno snapshot (es. sta tornando da generato a confermato, o gia'
//   passato per confermato in precedenza) lo RIUSA cosi' com'e' (mai
//   ricalcolato da dati live, vedi sequenza_operativa_e_batch_2026_09_14),
//   altrimenti costruisce lo stesso snapshot minimo placeholder gia' in uso
//   in confermaBatchAction (solo elenco skuId/skuCode - la risoluzione vera
//   dei 3 livelli arriva con la generazione output, ancora da costruire).
export async function cambiaStatoBatch(
  batchId: number,
  nuovoStato: "bozza" | "confermato" | "generato"
) {
  const batch = await db.query.batchPubblicazione.findFirst({
    where: (b, { eq }) => eq(b.id, batchId),
    with: { lotti: { with: { sku: { columns: { skuCode: true } } } } },
  });
  if (!batch) throw new Error("Batch non trovato");
  if (batch.stato === nuovoStato) return batch;

  if (nuovoStato === "bozza") {
    await db
      .update(batchPubblicazione)
      .set({ stato: "bozza", confermatoAt: null, snapshot: null })
      .where(eq(batchPubblicazione.id, batchId));
    return;
  }

  if (batch.lotti.length === 0) {
    throw new Error("Aggiungi almeno un lotto prima di portare il batch fuori da bozza");
  }
  const snapshot =
    batch.snapshot ?? {
      creato_il: new Date().toISOString(),
      lotti: batch.lotti.map((l) => ({ skuId: l.skuId, skuCode: l.sku.skuCode })),
    };

  await db
    .update(batchPubblicazione)
    .set({
      stato: nuovoStato,
      confermatoAt: batch.confermatoAt ?? new Date(),
      snapshot,
    })
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

// Elimina un batch in QUALSIASI stato (bozza/confermato/generato), SENZA
// ECCEZIONI - regola allentata una prima volta il 2026-09-24 (permesso fuori
// da bozza, ma ancora bloccato se un lotto era "accettato" da un'asta
// fisica), poi CAMBIO DI ROTTA ESPLICITO il 2026-09-25 (vedi
// backlog_ux_FINALIZZATO_2026_09_25_sessione_3 in
// claude/09c_python_pubblicazione.yaml, punto 2, confermato dal cliente con
// "confermo che sostituisci"): la cancellazione non e' PIU' MAI bloccata,
// nemmeno con lotti "accettato" - cascade-elimina sempre anche le righe
// batch_lotti, nessun lotto puo' restare "appeso" per vincolo strutturale.
// Questo libera automaticamente qualsiasi prenotazione quei lotti tenevano
// (vedi impegnatoSql, che conta solo i batch_lotti ancora esistenti).
// Il chiamante (server action, poi UI) e' responsabile di mostrare
// l'AVVISO NON BLOCCANTE con conferma esplicita PRIMA di chiamare questa
// funzione quando il batch tiene ancora una prenotazione reale (vedi
// contaLottiConPrenotazione in src/lib/prenotazione-batch.ts) - qui nessun
// controllo, nessuna eccezione: filosofia esplicitata dal cliente, "e' un
// picker senza modulo vendite agganciato [...] permettiamo con le dovute
// sicurezze, il torna indietro & simili" - le sicurezze sono avvisi, non
// blocchi duri.
// batch_lotti non ha onDelete cascade sullo schema (vedi schema.ts) -
// cancellazione manuale delle righe figlie prima del batch, dentro una
// transazione (stesso pattern gia' in uso in src/app/magazzino/actions.ts).
export async function eliminaBatch(batchId: number) {
  const batch = await db.query.batchPubblicazione.findFirst({
    where: (b, { eq }) => eq(b.id, batchId),
  });
  if (!batch) throw new Error("Batch non trovato");

  await db.transaction(async (tx) => {
    await tx.delete(batchLotti).where(eq(batchLotti.batchId, batchId));
    await tx.delete(batchPubblicazione).where(eq(batchPubblicazione.id, batchId));
  });
}
