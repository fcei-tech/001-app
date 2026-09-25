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
  riportaInBozza as riportaInBozzaQuery,
  cambiaStatoBatch as cambiaStatoBatchQuery,
  consegnaLotto as consegnaLottoQuery,
  annullaConsegna as annullaConsegnaQuery,
  rientroLotto as rientroLottoQuery,
  type ConsegnaDettagli,
  getBatch,
} from "@/db/pubblicazione-queries";

type StatoBatch = "bozza" | "confermato" | "pubblicato";

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
    await aggiornaOverrideLottoQuery(batchLottoId, { prezzo, riserva });
  } else {
    throw new Error("Questo canale non supporta un override per lotto");
  }

  revalidatePath(`/pubblicazione/${canaleId}/${batchId}`);
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
