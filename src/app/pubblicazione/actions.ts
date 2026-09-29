"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  creaBatch as creaBatchQuery,
  aggiungiLotti as aggiungiLottiQuery,
  confermaBatch as confermaBatchQuery,
  rimuoviLotto as rimuoviLottoQuery,
  accettaLotto as accettaLottoQuery,
  annullaAccettazione as annullaAccettazioneQuery,
  eliminaBatch as eliminaBatchQuery,
  aggiornaOverrideLotto as aggiornaOverrideLottoQuery,
  aggiornaCampoOverrideLotto as aggiornaCampoOverrideLottoQuery,
  aggiornaImpostazioniBatch as aggiornaImpostazioniBatchQuery,
  riportaInBozza as riportaInBozzaQuery,
  cambiaStatoBatch as cambiaStatoBatchQuery,
  consegnaLotto as consegnaLottoQuery,
  annullaConsegna as annullaConsegnaQuery,
  rientroLotto as rientroLottoQuery,
  segnaBatchPubblicato as segnaBatchPubblicatoQuery,
  type ConsegnaDettagli,
  type OverrideLotto,
  getBatch,
} from "@/db/pubblicazione-queries";
import { getFotoPerSkuIds } from "@/db/queries";
import {
  silenziaErrore as silenziaErroreQuery,
  riattivaSilenziamento as riattivaSilenziamentoQuery,
  riattivaSilenziamentiBulk as riattivaSilenziamentiBulkQuery,
  ripulisciSilenziamentiRisolti,
} from "@/db/silenziamenti-queries";
import {
  CATAWIKI_PROFILI_SPEDIZIONE,
  type ProfiloSpedizioneCatawiki,
} from "@/lib/catawiki-config";
import {
  IMPOSTAZIONI_BATCH_CATAWIKI_DEFAULT,
  risolviBatchCatawiki,
  TIPI_ERRORE_VALIDAZIONE,
  type ImpostazioniBatchCatawiki,
  type LottoPerRisoluzioneCatawiki,
  type OverrideLottoCatawiki,
  type TipoErroreValidazione,
} from "@/lib/catawiki-resolver";
import { generaCsvCatawiki } from "@/lib/catawiki-export";
import { generaPdfAstaFisica, scaricaMiniatureInParallelo } from "@/lib/asta-fisica-pdf";

type StatoBatch = "bozza" | "confermato" | "pubblicato";
const CONDIZIONI_VALIDE = ["A", "A-", "B+", "B", "B-", "C"] as const;

export async function creaBatch(formData: FormData) {
  const canaleId = Number(formData.get("canaleId"));
  if (!canaleId) throw new Error("Canale non valido");

  const batch = await creaBatchQuery(canaleId);
  revalidatePath(`/pubblicazione/${canaleId}`);
  redirect(`/pubblicazione/${canaleId}/${batch.id}`);
}

export async function aggiungiLottiABatch(formData: FormData) {
  const batchId = Number(formData.get("batchId"));
  const canaleId = Number(formData.get("canaleId"));
  const skuIds = formData
    .getAll("skuId")
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);

  if (!batchId) throw new Error("Batch non valido");
  if (skuIds.length === 0) throw new Error("Seleziona almeno uno sku");

  // Prezzo/riserva evento compilati direttamente nel picker (solo aste
  // online, vedi SelettoreLottiBatch) - campi opzionali per-sku, nome
  // prezzo_<skuId>/riserva_<skuId> nel form. Se assenti (asta_fisica o
  // canale statico) restano stringhe vuote, aggiungiLotti li scarta.
  const voci = skuIds.map((skuId) => ({
    skuId,
    prezzo: (formData.get(`prezzo_${skuId}`) ?? "").toString(),
    riserva: (formData.get(`riserva_${skuId}`) ?? "").toString(),
  }));

  await aggiungiLottiQuery(batchId, voci);
  revalidatePath(`/pubblicazione/${canaleId}/${batchId}`);
  redirect(`/pubblicazione/${canaleId}/${batchId}?aggiunti=1`);
}

export async function rimuoviLottoDaBatch(formData: FormData) {
  const batchLottoId = Number(formData.get("batchLottoId"));
  const batchId = Number(formData.get("batchId"));
  const canaleId = Number(formData.get("canaleId"));
  if (!batchLottoId || !batchId) throw new Error("Riferimento non valido");

  const batch = await getBatch(batchId);
  if (!batch) throw new Error("Batch non trovato");
  if (batch.stato !== "bozza") {
    throw new Error("Non si puo' modificare un batch gia' confermato");
  }

  await rimuoviLottoQuery(batchLottoId);
  revalidatePath(`/pubblicazione/${canaleId}/${batchId}`);
}

// Accetta un lotto "candidato" (asta fisica): la casa d'asta lo ha preso in
// consegna davvero, da qui in poi consuma disponibilita' (vedi
// impegnatoSql). A differenza di aggiungi/rimuovi lotto, questa azione resta
// disponibile anche a batch GIA' confermato - e' proprio il momento in cui
// serve (la candidatura viene inviata alla conferma del batch, la risposta
// della casa d'asta arriva sempre dopo). Verifica esplicita canale
// asta_fisica + statoRiga candidato qui nell'azione, non solo lato UI.
export async function accettaLottoAction(formData: FormData) {
  const batchLottoId = Number(formData.get("batchLottoId"));
  const batchId = Number(formData.get("batchId"));
  const canaleId = Number(formData.get("canaleId"));
  if (!batchLottoId || !batchId) throw new Error("Riferimento non valido");

  const batch = await getBatch(batchId);
  if (!batch) throw new Error("Batch non trovato");
  if (batch.canale.tipo !== "asta_fisica") {
    throw new Error("Accetta lotto si applica solo alle aste fisiche");
  }
  const lotto = batch.lotti.find((l) => l.id === batchLottoId);
  if (!lotto) throw new Error("Lotto non trovato in questo batch");
  if (lotto.statoRiga !== "candidato") {
    throw new Error("Solo un lotto candidato puo' essere accettato");
  }

  await accettaLottoQuery(batchLottoId);
  revalidatePath(`/pubblicazione/${canaleId}/${batchId}`);
}

// Annulla l'accettazione di un lotto (2026-09-24, richiesta esplicita
// utente: "finche' non colleghiamo le vendite, deve essermi permesso
// liberare il lotto da questo stato"). Simmetrica ad accettaLottoAction:
// verifica canale asta_fisica + statoRiga "accettato" qui nell'azione, non
// solo lato UI. Disponibile anche a batch confermato/pubblicato - e' proprio
// li' che serve (un lotto accettato per errore o un accordo saltato con la
// casa d'asta si sblocca cosi', senza dover toccare il resto del batch).
export async function annullaAccettazioneAction(formData: FormData) {
  const batchLottoId = Number(formData.get("batchLottoId"));
  const batchId = Number(formData.get("batchId"));
  const canaleId = Number(formData.get("canaleId"));
  if (!batchLottoId || !batchId) throw new Error("Riferimento non valido");

  const batch = await getBatch(batchId);
  if (!batch) throw new Error("Batch non trovato");
  if (batch.canale.tipo !== "asta_fisica") {
    throw new Error("Annulla accettazione si applica solo alle aste fisiche");
  }
  const lotto = batch.lotti.find((l) => l.id === batchLottoId);
  if (!lotto) throw new Error("Lotto non trovato in questo batch");
  if (lotto.statoRiga !== "accettato") {
    throw new Error("Solo un lotto accettato puo' essere annullato");
  }

  await annullaAccettazioneQuery(batchLottoId);
  revalidatePath(`/pubblicazione/${canaleId}/${batchId}`);
}

export async function confermaBatchAction(formData: FormData) {
  const batchId = Number(formData.get("batchId"));
  const canaleId = Number(formData.get("canaleId"));
  if (!batchId) throw new Error("Batch non valido");

  const batch = await getBatch(batchId);
  if (!batch) throw new Error("Batch non trovato");
  if (batch.lotti.length === 0) throw new Error("Aggiungi almeno un lotto prima di confermare");

  // Snapshot MINIMO per questa prima fetta (solo struttura dati + UI base):
  // solo l'elenco sku/skuCode presente al momento della conferma. La
  // risoluzione vera dei 3 livelli di impostazioni (canale/batch/override,
  // vedi impostazioni_modello_a_3_livelli) e la relativa anteprima sono
  // fuori scope qui - arrivano in una fetta successiva insieme alla
  // generazione dell'output. Il campo snapshot esiste gia' nello schema e
  // va valorizzato comunque alla conferma (sequenza_operativa_e_batch_
  // 2026_09_14: mai null su un batch confermato), quindi per ora porta solo
  // il minimo indispensabile.
  const snapshot = {
    creato_il: new Date().toISOString(),
    lotti: batch.lotti.map((l) => ({ skuId: l.skuId, skuCode: l.sku.skuCode })),
  };

  await confermaBatchQuery(batchId, snapshot);
  revalidatePath(`/pubblicazione/${canaleId}/${batchId}`);
  redirect(`/pubblicazione/${canaleId}/${batchId}?confermato=1`);
}

// Riporta in bozza un batch confermato/pubblicato (2026-09-23 notte, richiesta
// esplicita utente dopo test installazione reale: "mi sembra strano non
// poter gestire i batch confermati"). Transizioni ora libere in qualsiasi
// direzione (2026-09-25, cambio di rotta - vedi riportaInBozza in
// pubblicazione-queries.ts per il testo completo della decisione) - qui solo
// l'orchestrazione revalidate, stesso schema delle altre action di questo
// file. Vedi anche cambiaStatoBatchAction sotto per il controllo generico a
// 3 vie (usato dai nuovi controlli esterni), che copre lo stesso caso d'uso
// in modo piu' diretto - questa action resta per compatibilita' col bottone
// "Riporta in bozza" gia' esistente nella pagina dettaglio batch.
export async function riportaInBozzaAction(formData: FormData) {
  const batchId = Number(formData.get("batchId"));
  const canaleId = Number(formData.get("canaleId"));
  if (!batchId) throw new Error("Batch non valido");

  await riportaInBozzaQuery(batchId);
  revalidatePath(`/pubblicazione/${canaleId}/${batchId}`);
}

// Cambia lo stato di un singolo batch a una qualsiasi delle 3 destinazioni,
// in qualsiasi direzione - controllo esterno generico (2026-09-25, punto 2
// del backlog UX FINALIZZATO, vedi cambiaStatoBatch in
// pubblicazione-queries.ts per il dettaglio). Usato sia dal controllo
// "Cambia stato" nella pagina dettaglio batch sia dalla riga della lista
// batch di un canale (CambiaStatoBatchControl) - niente redirect qui,
// chiamato via startTransition dal client, non da un <form> nativo (serve
// un feedback immediato senza navigazione, coerente con OverrideLottoForm).
export async function cambiaStatoBatchAction(formData: FormData) {
  const batchId = Number(formData.get("batchId"));
  const canaleId = Number(formData.get("canaleId"));
  const nuovoStato = formData.get("nuovoStato") as StatoBatch | null;
  if (!batchId || !nuovoStato) throw new Error("Riferimento non valido");

  await cambiaStatoBatchQuery(batchId, nuovoStato);
  revalidatePath(`/pubblicazione/${canaleId}`);
  revalidatePath(`/pubblicazione/${canaleId}/${batchId}`);
}

// Versione multi-selezione di cambiaStatoBatchAction - usata dalla barra
// azioni della lista batch di un canale quando piu' righe sono selezionate
// (shift+click, vedi src/lib/selezione-multipla.ts). Applica la stessa
// transizione a ciascun batch selezionato UNO ALLA VOLTA, senza bloccare
// l'intera operazione se uno dei batch selezionati fallisce (es. un batch
// ancora in bozza senza lotti non puo' passare a confermato/pubblicato) -
// principio gia' in uso altrove nel progetto per la validazione riga-per-
// riga ("mai un errore muto, mai un blocco totale per un problema isolato").
// Ritorna quanti sono riusciti e il dettaglio di eventuali errori, cosi' il
// client puo' mostrarli invece di far sparire in silenzio un batch dalla
// selezione.
export async function cambiaStatoBatchMultiploAction(formData: FormData) {
  const canaleId = Number(formData.get("canaleId"));
  const nuovoStato = formData.get("nuovoStato") as StatoBatch | null;
  const batchIds = formData.getAll("batchId").map(Number).filter((n) => Number.isFinite(n) && n > 0);
  if (!nuovoStato || batchIds.length === 0) throw new Error("Selezione non valida");

  const errori: { batchId: number; messaggio: string }[] = [];
  let ok = 0;
  for (const batchId of batchIds) {
    try {
      await cambiaStatoBatchQuery(batchId, nuovoStato);
      ok++;
    } catch (e) {
      errori.push({ batchId, messaggio: e instanceof Error ? e.message : "Errore sconosciuto" });
    }
  }

  revalidatePath(`/pubblicazione/${canaleId}`);
  return { ok, errori };
}

// Scrive l'override di un singolo lotto (2026-09-24, richiesta esplicita
// utente - vedi OverrideLotto in pubblicazione-queries.ts per il significato
// dei due usi). Il campo consentito dipende dal TIPO di canale, non piu' dal
// nome (Catawiki non e' piu' un caso speciale: e' un canale come Bidspirit
// ed eBay Asta, tutti asta_online, tutti trattati uguale):
// - asta_fisica -> solo "riservaProposta"
// - asta_online -> "prezzo" e "riserva" insieme (un solo Salva per riga,
//   stesso form sia nel picker sia in "Lotti nel batch" - vedi
//   SelettoreLottiBatch e la pagina batch).
// Bloccato SOLO su asta_online se il batch e' gia' "pubblicato" (l'output e'
// gia' stato prodotto con i valori di allora) - su asta_fisica la Riserva
// proposta resta sempre modificabile, vedi commento piu' sotto.
export async function aggiornaOverrideLottoAction(formData: FormData) {
  const batchLottoId = Number(formData.get("batchLottoId"));
  const batchId = Number(formData.get("batchId"));
  const canaleId = Number(formData.get("canaleId"));
  if (!batchLottoId || !batchId) throw new Error("Riferimento non valido");

  const batch = await getBatch(batchId);
  if (!batch) throw new Error("Batch non trovato");

  if (batch.canale.tipo === "asta_fisica") {
    // Riserva proposta: SEMPRE modificabile, qualsiasi stato del batch
    // (2026-09-25, sessione 5, richiesta esplicita utente: "la riserva:
    // sempre modificabile" - a differenza di asta_online, sulle aste
    // fisiche la trattativa con la casa d'asta continua anche dopo che il
    // batch e' stato inviato/pubblicato, non si "congela" a quel punto).
    const riservaProposta = (formData.get("riservaProposta") ?? "").toString();
    await aggiornaOverrideLottoQuery(batchLottoId, { riservaProposta });
  } else if (batch.canale.tipo === "asta_online") {
    if (batch.stato === "pubblicato") {
      throw new Error("Non si puo' modificare un lotto di un batch gia' pubblicato");
    }
    const prezzo = (formData.get("prezzo") ?? "").toString();
    const riserva = (formData.get("riserva") ?? "").toString();
    const condizione = (formData.get("condizione") ?? "").toString();
    if (condizione && !CONDIZIONI_VALIDE.includes(condizione as (typeof CONDIZIONI_VALIDE)[number])) {
      throw new Error("Condizione non valida");
    }
    await aggiornaOverrideLottoQuery(batchLottoId, { prezzo, riserva, condizione });
  } else {
    throw new Error("Questo canale non supporta un override per lotto");
  }

  revalidatePath(`/pubblicazione/${canaleId}/${batchId}`);
}

// Salvataggio per singola cella (2026-09-28, generazione output Catawiki):
// a differenza dell'action sopra (un form unico che invia prezzo+riserva
// insieme), questa e' pensata per le celle editabili inline della tabella
// "Lotti nel batch" (CellTesto/CellSelect, stile Magazzino - vedi
// editable-cell.tsx) - autosave per singolo campo, senza dover rispedire
// anche gli altri due. Chiamata direttamente con argomenti tipizzati (non
// FormData) dal componente client, stesso pattern gia' in uso in
// aggiornaCampiSkuInline (src/app/magazzino/actions.ts).
export async function aggiornaCampoOverrideLottoAction(input: {
  batchLottoId: number;
  batchId: number;
  canaleId: number;
  campo: "prezzo" | "riserva" | "condizione";
  valore: string;
}) {
  const { batchLottoId, batchId, canaleId, campo, valore } = input;
  if (!batchLottoId || !batchId) throw new Error("Riferimento non valido");

  const batch = await getBatch(batchId);
  if (!batch) throw new Error("Batch non trovato");
  if (batch.canale.tipo !== "asta_online") {
    throw new Error("Questo canale non supporta Prezzo/Riserva/Condizione per lotto");
  }
  if (batch.stato === "pubblicato") {
    throw new Error("Non si puo' modificare un lotto di un batch gia' pubblicato");
  }
  if (campo === "condizione" && valore.trim() && !CONDIZIONI_VALIDE.includes(valore.trim() as (typeof CONDIZIONI_VALIDE)[number])) {
    throw new Error("Condizione non valida");
  }

  await aggiornaCampoOverrideLottoQuery(batchLottoId, campo as keyof OverrideLotto, valore);
  revalidatePath(`/pubblicazione/${canaleId}/${batchId}`);
}

// Impostazioni di livello batch, SOLO Catawiki per questa release (2026-09-
// 28, generazione output): profilo di spedizione, riserva attiva si/no per
// tutto il batch, i due modificatori (%prezzo/€riserva) e il messaggio
// esperto - vedi ImpostazioniBatchCatawiki in src/lib/catawiki-resolver.ts.
// Bloccata su batch gia' "pubblicato" (stesso principio di aggiornaOverride
// LottoAction sopra: l'output di quel batch e' gia' stato generato con le
// impostazioni di allora).
export async function aggiornaImpostazioniBatchCatawikiAction(formData: FormData) {
  const batchId = Number(formData.get("batchId"));
  const canaleId = Number(formData.get("canaleId"));
  if (!batchId) throw new Error("Batch non valido");

  const batch = await getBatch(batchId);
  if (!batch) throw new Error("Batch non trovato");
  if (batch.canale.nome !== "Catawiki") {
    throw new Error("Queste impostazioni sono disponibili solo per il canale Catawiki");
  }
  if (batch.stato === "pubblicato") {
    throw new Error("Non si possono modificare le impostazioni di un batch gia' pubblicato");
  }

  const profiloSpedizione = (formData.get("profiloSpedizione") ?? "").toString();
  if (!(profiloSpedizione in CATAWIKI_PROFILI_SPEDIZIONE)) {
    throw new Error("Profilo di spedizione non valido");
  }
  const riservaAttiva = formData.get("riservaAttiva") === "on";
  const modificatorePrezzoPercentuale = Number(formData.get("modificatorePrezzoPercentuale") ?? 0) || 0;
  const modificatoreRiservaEur = Number(formData.get("modificatoreRiservaEur") ?? 0) || 0;
  const messaggioEsperto = (formData.get("messaggioEsperto") ?? "").toString();

  const impostazioni: ImpostazioniBatchCatawiki = {
    profiloSpedizione: profiloSpedizione as ProfiloSpedizioneCatawiki,
    riservaAttiva,
    modificatorePrezzoPercentuale,
    modificatoreRiservaEur,
    messaggioEsperto,
  };

  await aggiornaImpostazioniBatchQuery(batchId, impostazioni);
  revalidatePath(`/pubblicazione/${canaleId}/${batchId}`);
}

// Genera il file CSV Catawiki e, nella STESSA azione, porta il batch a
// "pubblicato" (2026-09-28, richiesta esplicita utente: "un solo bottone,
// genera E pubblica insieme" - nessun versionamento del file, ogni
// generazione e' un ricalcolo fresco dai dati correnti, scaricato e finito,
// mai un file salvato da qualche parte da poter riscaricare dopo). Chiamata
// direttamente con l'id del batch (non FormData) dal componente client
// (GeneraFileCatawikiButton), che riceve {csv, filename, scartati} e
// costruisce lui il download (i Server Actions non possono innescare un
// download browser direttamente).
//
// Righe scartate (errori di validazione non silenziati o silenziati - il
// silenziamento riguarda SOLO la segnalazione in UI, MAI l'inclusione nel
// CSV, vedi commento su silenziamentiErrore in schema.ts) sono escluse dal
// file e restituite al chiamante per il riepilogo mostrato dopo il
// download. Effetto collaterale: pulizia dei silenziamenti ormai risolti
// per gli sku di QUESTO batch (vedi ripulisciSilenziamentiRisolti).
export async function generaFileCatawikiAction(batchId: number): Promise<{
  csv: string;
  filename: string;
  scartati: { skuCode: string; artista: string; opera: string; errori: TipoErroreValidazione[] }[];
}> {
  const batch = await getBatch(batchId);
  if (!batch) throw new Error("Batch non trovato");
  if (batch.canale.nome !== "Catawiki") {
    throw new Error("La generazione file e' disponibile solo per il canale Catawiki");
  }
  if (batch.stato !== "confermato") {
    throw new Error("Il batch deve essere confermato prima di generare il file");
  }
  if (batch.lotti.length === 0) throw new Error("Il batch non ha lotti");

  const impostazioni: ImpostazioniBatchCatawiki = {
    ...IMPOSTAZIONI_BATCH_CATAWIKI_DEFAULT,
    ...((batch.impostazioniBatch ?? {}) as Partial<ImpostazioniBatchCatawiki>),
  };

  const skuIds = batch.lotti.map((l) => l.skuId);
  const fotoMappa = await getFotoPerSkuIds(skuIds);
  const skuPerId = new Map(batch.lotti.map((l) => [l.skuId, l.sku]));

  const lottiPerRisoluzione: LottoPerRisoluzioneCatawiki[] = batch.lotti.map((l) => ({
    batchLottoId: l.id,
    skuId: l.skuId,
    skuCode: l.sku.skuCode,
    skuCondizione: l.sku.condizione,
    skuAnno: l.sku.anno,
    skuPrezzoCatawiki: l.sku.prezzoCatawiki,
    override: (l.override as OverrideLottoCatawiki | null) ?? null,
    numeroFoto: fotoMappa.get(l.skuId)?.length ?? 0,
  }));

  const righeRisolte = risolviBatchCatawiki(lottiPerRisoluzione, impostazioni);
  const righeValide = righeRisolte.filter((r) => r.valido);
  const righeScartate = righeRisolte.filter((r) => !r.valido);

  if (righeValide.length === 0) {
    throw new Error("Nessun lotto valido da esportare - correggi gli errori segnalati prima di generare il file");
  }

  const csv = generaCsvCatawiki(
    righeValide.map((risolta) => {
      const s = skuPerId.get(risolta.skuId)!;
      return {
        risolta,
        sku: {
          artista: s.artista,
          opera: s.opera,
          larghezza: s.larghezza,
          altezza: s.altezza,
          supporto: s.supporto,
          anno: (s.anno ?? "").trim(),
        },
        foto: (fotoMappa.get(risolta.skuId) ?? []).map((f) => f.url),
      };
    }),
    impostazioni
  );

  // Pulizia silenziamenti risolti (effetto collaterale legittimo: siamo
  // dentro una mutazione, non un render/GET - vedi commento su
  // silenziamentiErrore in schema.ts).
  const erroriAncoraPresenti = righeScartate.flatMap((r) =>
    r.errori.map((tipoErrore) => ({ skuId: r.skuId, tipoErrore }))
  );
  await ripulisciSilenziamentiRisolti(batch.canaleId, skuIds, erroriAncoraPresenti);

  await segnaBatchPubblicatoQuery(batchId);

  const now = new Date();
  const bollino = now.toISOString().replace(/[-:]/g, "").replace("T", "_").slice(0, 13);
  const filename = `batch_catawiki_${batchId}_${bollino}.csv`;

  revalidatePath(`/pubblicazione/${batch.canaleId}/${batchId}`);
  revalidatePath(`/pubblicazione/${batch.canaleId}`);
  revalidatePath(`/pubblicazione/silenziamenti`);

  return {
    csv,
    filename,
    scartati: righeScartate.map((r) => {
      const s = skuPerId.get(r.skuId)!;
      return { skuCode: r.skuCode, artista: s.artista, opera: s.opera, errori: r.errori };
    }),
  };
}

// --- Silenziamento errori di validazione (2026-09-28) --------------------
// Vedi commento su silenziamentiErrore in schema.ts per il design completo.
// Chiamate con argomenti tipizzati (non FormData), stesso pattern di
// generaFileCatawikiAction/aggiornaCampoOverrideLottoAction sopra - usate
// sia dal banner di avviso nella pagina batch (silenzia singolo/multiplo)
// sia dalla pagina dedicata /pubblicazione/silenziamenti (riattiva singolo/
// multiplo).
export async function silenziaErroreAction(input: {
  skuId: number;
  canaleId: number;
  tipoErrore: TipoErroreValidazione;
  note?: string;
  batchId?: number;
}) {
  if (!TIPI_ERRORE_VALIDAZIONE.includes(input.tipoErrore)) {
    throw new Error("Tipo di errore non valido");
  }
  await silenziaErroreQuery(input);
  if (input.batchId) revalidatePath(`/pubblicazione/${input.canaleId}/${input.batchId}`);
  revalidatePath(`/pubblicazione/silenziamenti`);
}

export async function silenziaErroriBulkAction(input: {
  voci: { skuId: number; canaleId: number; tipoErrore: TipoErroreValidazione }[];
  batchId?: number;
}) {
  for (const voce of input.voci) {
    if (!TIPI_ERRORE_VALIDAZIONE.includes(voce.tipoErrore)) continue;
    await silenziaErroreQuery(voce);
  }
  const canaleId = input.voci[0]?.canaleId;
  if (input.batchId && canaleId) revalidatePath(`/pubblicazione/${canaleId}/${input.batchId}`);
  revalidatePath(`/pubblicazione/silenziamenti`);
}

export async function riattivaSilenziamentoAction(id: number) {
  await riattivaSilenziamentoQuery(id);
  revalidatePath(`/pubblicazione/silenziamenti`);
}

export async function riattivaSilenziamentiBulkAction(ids: number[]) {
  await riattivaSilenziamentiBulkQuery(ids);
  revalidatePath(`/pubblicazione/silenziamenti`);
}

// Elimina un batch in QUALSIASI stato, SENZA ECCEZIONI (2026-09-23 sera,
// regola allentata il 2026-09-24, poi cambio di rotta 2026-09-25 - vedi
// eliminaBatch in pubblicazione-queries.ts per il testo completo della
// decisione). L'AVVISO non bloccante su cosa si libera (se il batch teneva
// una prenotazione reale) e' responsabilita' del chiamante lato client
// (EliminaBatchButton, dialog di conferma) PRIMA di invocare questa action -
// qui solo l'orchestrazione redirect/revalidate, nessun controllo.
export async function eliminaBatchAction(formData: FormData) {
  const batchId = Number(formData.get("batchId"));
  const canaleId = Number(formData.get("canaleId"));
  if (!batchId) throw new Error("Batch non valido");

  await eliminaBatchQuery(batchId);
  revalidatePath(`/pubblicazione/${canaleId}`);
  redirect(`/pubblicazione/${canaleId}?eliminato=1`);
}

// Versione multi-selezione di eliminaBatchAction - usata dalla barra azioni
// della lista batch di un canale (2026-09-25, punto 2 del backlog UX
// FINALIZZATO: "cancellazione multipla [...] stessa logica applicata per
// ogni batch selezionato, un unico avviso consolidato"). L'avviso
// consolidato (cosa si libera, quanti lotti coinvolti) e' costruito lato
// client PRIMA di chiamare questa action (vedi contaLottiConPrenotazione in
// src/lib/prenotazione-batch.ts) - qui elimina ogni batch selezionato senza
// eccezioni (eliminaBatch non blocca mai, vedi sopra), nessun caso di
// "alcuni bloccati" da gestire: l'idea di saltare/bloccare solo i batch con
// lotti accettati e' stata abbandonata insieme al blocco duro.
export async function eliminaBatchMultiploAction(formData: FormData) {
  const canaleId = Number(formData.get("canaleId"));
  const batchIds = formData.getAll("batchId").map(Number).filter((n) => Number.isFinite(n) && n > 0);
  if (batchIds.length === 0) throw new Error("Nessun batch selezionato");

  for (const batchId of batchIds) {
    await eliminaBatchQuery(batchId);
  }

  revalidatePath(`/pubblicazione/${canaleId}`);
  redirect(`/pubblicazione/${canaleId}?eliminati=${batchIds.length}`);
}

// --- Consegna/Annulla consegna/Rientro (solo asta_fisica, 2026-09-25,
// sessione 5 - vedi consegnaLotto/annullaConsegna/rientroLotto in
// pubblicazione-queries.ts per il dettaglio del meccanismo). Verifica
// esplicita canale asta_fisica + statoRiga qui nell'azione, non solo lato UI
// (stesso principio gia' in uso per accettaLottoAction/
// annullaAccettazioneAction).

const PROPRIETA_VALIDE = ["FP", "CV", "TERZI"] as const;

// Consegna: l'operatore ha scelto origine/destinazione/quantita' dal form
// guidato (SelettoreOrigineDestinazione, precompilato da saldi reali - vedi
// getSaldiSkuPerUbicazione in src/db/queries.ts). Disponibile solo su un
// lotto "accettato" non ancora consegnato.
export async function consegnaLottoAction(formData: FormData) {
  const batchLottoId = Number(formData.get("batchLottoId"));
  const batchId = Number(formData.get("batchId"));
  const canaleId = Number(formData.get("canaleId"));
  const proprieta = formData.get("proprieta")?.toString();
  const ubicazioneOrigineId = Number(formData.get("ubicazioneOrigineId"));
  const ubicazioneDestinazioneId = Number(formData.get("ubicazioneDestinazioneId"));
  const quantita = Number(formData.get("quantita"));
  if (!batchLottoId || !batchId) throw new Error("Riferimento non valido");
  if (!proprieta || !PROPRIETA_VALIDE.includes(proprieta as (typeof PROPRIETA_VALIDE)[number])) {
    throw new Error("Proprieta' non valida");
  }
  if (!ubicazioneOrigineId || !ubicazioneDestinazioneId) {
    throw new Error("Scegli ubicazione di origine e destinazione");
  }
  if (ubicazioneOrigineId === ubicazioneDestinazioneId) {
    throw new Error("Origine e destinazione non possono coincidere");
  }
  if (!Number.isFinite(quantita) || quantita <= 0) {
    throw new Error("Quantita' non valida");
  }

  const batch = await getBatch(batchId);
  if (!batch) throw new Error("Batch non trovato");
  if (batch.canale.tipo !== "asta_fisica") {
    throw new Error("Consegna si applica solo alle aste fisiche");
  }
  const lotto = batch.lotti.find((l) => l.id === batchLottoId);
  if (!lotto) throw new Error("Lotto non trovato in questo batch");
  if (lotto.statoRiga !== "accettato") {
    throw new Error("Solo un lotto accettato puo' essere consegnato");
  }
  if (lotto.consegnatoAt) {
    throw new Error("Questo lotto e' gia' stato consegnato");
  }

  await consegnaLottoQuery(batchLottoId, lotto.skuId, {
    proprieta: proprieta as ConsegnaDettagli["proprieta"],
    ubicazioneOrigineId,
    ubicazioneDestinazioneId,
    quantita,
  });
  revalidatePath(`/pubblicazione/${canaleId}/${batchId}`);
}

// "Ho cliccato Consegna per errore" - inverte lo stesso movimento usando i
// dettagli gia' salvati (consegnaDettagli), nessun input dall'operatore.
export async function annullaConsegnaAction(formData: FormData) {
  const batchLottoId = Number(formData.get("batchLottoId"));
  const batchId = Number(formData.get("batchId"));
  const canaleId = Number(formData.get("canaleId"));
  if (!batchLottoId || !batchId) throw new Error("Riferimento non valido");

  const batch = await getBatch(batchId);
  if (!batch) throw new Error("Batch non trovato");
  if (batch.canale.tipo !== "asta_fisica") {
    throw new Error("Annulla consegna si applica solo alle aste fisiche");
  }
  const lotto = batch.lotti.find((l) => l.id === batchLottoId);
  if (!lotto) throw new Error("Lotto non trovato in questo batch");
  if (!lotto.consegnatoAt || !lotto.consegnaDettagli) {
    throw new Error("Questo lotto non risulta consegnato");
  }

  await annullaConsegnaQuery(batchLottoId, lotto.skuId, lotto.consegnaDettagli as ConsegnaDettagli);
  revalidatePath(`/pubblicazione/${canaleId}/${batchId}`);
}

// Rientro: il pezzo torna indietro (invenduto/ritirato) - rimuove il lotto
// dal batch, invertendo anche il movimento fisico della consegna. Disponibile
// solo su un lotto gia' consegnato (per un lotto accettato ma mai consegnato
// c'e' gia' "Annulla accettazione" - non serve un secondo percorso allo
// stesso risultato).
export async function rientroLottoAction(formData: FormData) {
  const batchLottoId = Number(formData.get("batchLottoId"));
  const batchId = Number(formData.get("batchId"));
  const canaleId = Number(formData.get("canaleId"));
  if (!batchLottoId || !batchId) throw new Error("Riferimento non valido");

  const batch = await getBatch(batchId);
  if (!batch) throw new Error("Batch non trovato");
  if (batch.canale.tipo !== "asta_fisica") {
    throw new Error("Rientro si applica solo alle aste fisiche");
  }
  const lotto = batch.lotti.find((l) => l.id === batchLottoId);
  if (!lotto) throw new Error("Lotto non trovato in questo batch");
  if (!lotto.consegnatoAt) {
    throw new Error("Questo lotto non risulta consegnato - usa Annulla accettazione");
  }

  await rientroLottoQuery(batchLottoId, lotto.skuId, (lotto.consegnaDettagli as ConsegnaDettagli | null) ?? null);
  revalidatePath(`/pubblicazione/${canaleId}/${batchId}`);
}

// Genera il PDF "lista lotti" per una casa d'asta fisica (2026-09-29) - vale
// per TUTTI i canali con tipo asta_fisica (Cambi, Bolaffi, Wannenes, Libero,
// e qualsiasi canale futuro dello stesso tipo), nessun nome cablato. Il PDF
// e' descritto in src/lib/asta-fisica-pdf.ts.
//
// Regola di stato (stessa logica di generaFileCatawikiAction, con una
// differenza voluta): da "confermato" genera e porta il batch a "pubblicato"
// (= lista mandata alla casa); da "pubblicato" rigenera SENZA cambiare stato
// (serve: la Riserva proposta resta modificabile dopo l'invio, vedi
// mostraOverride nella pagina batch, e la lista puo' andare rispedita); da
// "bozza" rifiuta. Se la generazione fallisce lo stato non cambia mai: il
// passaggio a "pubblicato" avviene DOPO che il PDF e' stato costruito.
//
// Ritorna il PDF in base64 (i Server Actions restituiscono valori
// serializzabili): il download lo costruisce il componente client.
export async function generaFilePdfAstaFisicaAction(batchId: number): Promise<{
  pdfBase64: string;
  filename: string;
  senzaMiniatura: { skuCode: string; artista: string; opera: string }[];
  senzaFoto: { skuCode: string; artista: string; opera: string }[];
  passatoAPubblicato: boolean;
}> {
  const batch = await getBatch(batchId);
  if (!batch) throw new Error("Batch non trovato");
  if (batch.canale.tipo !== "asta_fisica") {
    throw new Error("La generazione del PDF e' disponibile solo per le aste fisiche");
  }
  if (batch.stato === "bozza") {
    throw new Error("Il batch deve essere confermato prima di generare il file");
  }
  if (batch.lotti.length === 0) throw new Error("Il batch non ha lotti");

  const fotoMappa = await getFotoPerSkuIds(batch.lotti.map((l) => l.skuId));
  const pulisciMisura = (v: string | null) => (v ? v.replace(/\.0+$/, "") : "?");

  const lotti = batch.lotti.map((l) => {
    const fotoUrls = (fotoMappa.get(l.skuId) ?? []).map((f) => f.url);
    const haMisure = l.sku.larghezza || l.sku.altezza;
    return {
      skuCode: l.sku.skuCode,
      artista: l.sku.artista,
      opera: l.sku.opera,
      misure: haMisure ? `${pulisciMisura(l.sku.larghezza)} \u00d7 ${pulisciMisura(l.sku.altezza)} cm` : "",
      riserva: ((l.override as OverrideLotto | null)?.riservaProposta ?? "").trim(),
      fotoUrls,
    };
  });

  const miniature = await scaricaMiniatureInParallelo(lotti.map((l) => l.fotoUrls[0] ?? null));

  const now = new Date();
  const partiRoma = new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const parte = (tipo: string) => partiRoma.find((p) => p.type === tipo)?.value ?? "";
  const dataTesto = `${parte("day")}/${parte("month")}/${parte("year")}`;
  const bollino = `${parte("year")}${parte("month")}${parte("day")}_${parte("hour")}${parte("minute")}`;
  const slugCasa =
    batch.canale.nome
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "asta";
  const filename = `batch_${slugCasa}_${batchId}_${bollino}.pdf`;

  const bytes = await generaPdfAstaFisica({
    nomeCasa: batch.canale.nome,
    batchId,
    dataTesto,
    lotti: lotti.map((l, idx) => ({ ...l, miniatura: miniature[idx] })),
  });

  // Il passaggio di stato avviene SOLO a PDF costruito con successo.
  const passatoAPubblicato = batch.stato === "confermato";
  if (passatoAPubblicato) await segnaBatchPubblicatoQuery(batchId);

  revalidatePath(`/pubblicazione/${batch.canaleId}/${batchId}`);
  revalidatePath(`/pubblicazione/${batch.canaleId}`);

  const descrivi = (idx: number) => ({
    skuCode: lotti[idx].skuCode,
    artista: lotti[idx].artista,
    opera: lotti[idx].opera,
  });
  return {
    pdfBase64: Buffer.from(bytes).toString("base64"),
    filename,
    senzaMiniatura: lotti.map((l, i) => i).filter((i) => lotti[i].fotoUrls.length > 0 && !miniature[i]).map(descrivi),
    senzaFoto: lotti.map((l, i) => i).filter((i) => lotti[i].fotoUrls.length === 0).map(descrivi),
    passatoAPubblicato,
  };
}
